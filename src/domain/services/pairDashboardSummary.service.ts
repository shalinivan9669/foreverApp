import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { Like } from '@/models/Like';
import { User, type UserType } from '@/models/User';
import type { PairType } from '@/models/Pair';
import { toLikeSummaryDTO, toPairActivityDTO, toPairDTO, toUserDTO } from '@/lib/dto';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import {
  buildPairWeeklyCheckInSummary,
  type PairWeeklyCheckInSummaryDTO,
} from '@/domain/services/weeklyCheckIn.service';

type PairDoc = HydratedDocument<PairType>;

type PublicPairMemberDTO = {
  id: string;
  username: string;
  avatar: string;
  avatarUrl?: string | null;
};

type PairDiagnosticsOverallDTO = {
  score: number;
  confidence: number;
  status: 'strong' | 'neutral' | 'risk' | 'insufficient_data';
};

type PairCompactDiagnosticsDTO = {
  overall?: PairDiagnosticsOverallDTO;
  strongSides: { axis: string; facets: string[] }[];
  riskZones: { axis: string; facets: string[]; severity: 1 | 2 | 3 }[];
  complementMap: { axis: string; A_covers_B: string[]; B_covers_A: string[] }[];
  levelDelta: { axis: string; delta: number }[];
  lastDiagnosticsAt?: string;
};

type PairNextStepDTO = {
  kind:
    | 'complete_weekly_checkin'
    | 'wait_or_invite_peer_checkin'
    | 'review_weekly_divergence'
    | 'complete_current_activity'
    | 'run_pair_diagnostics'
    | 'review_risk_zone'
    | 'suggest_activity'
    | 'none';
  title: string;
  description: string;
  href?: string;
  ctaLabel?: string;
  axis?: string;
  severity?: 1 | 2 | 3;
};

type PublicUserSource = Pick<UserType, 'id' | 'username' | 'avatar'>;
type PairPassportWithOverall = NonNullable<PairType['passport']> & {
  overall?: PairDiagnosticsOverallDTO;
};

const AXIS_LABELS: Record<string, string> = {
  communication: 'Коммуникация',
  domestic: 'Быт',
  personalViews: 'Личные взгляды',
  finance: 'Финансы',
  sexuality: 'Близость',
  psyche: 'Ресурс',
};

const toIso = (value: Date | string | undefined | null): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
};

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const normalizeSeverity = (value: number | undefined): 1 | 2 | 3 => {
  if (value === 3) return 3;
  if (value === 2) return 2;
  return 1;
};

const normalizeOverall = (
  overall?: PairDiagnosticsOverallDTO
): PairDiagnosticsOverallDTO | undefined => {
  if (!overall) return undefined;

  return {
    score: clamp01(overall.score),
    confidence: clamp01(overall.confidence),
    status: overall.status,
  };
};

const hasDiagnosticsSignal = (diagnostics: PairCompactDiagnosticsDTO): boolean =>
  Boolean(
    diagnostics.lastDiagnosticsAt ||
      diagnostics.strongSides.length ||
      diagnostics.riskZones.length ||
      diagnostics.complementMap.length ||
      diagnostics.levelDelta.length
  );

const inferOverallFromPassport = (
  diagnostics: Omit<PairCompactDiagnosticsDTO, 'overall'>
): PairDiagnosticsOverallDTO => {
  const topSeverity = diagnostics.riskZones.reduce(
    (max, risk) => Math.max(max, risk.severity),
    0
  );

  if (!hasDiagnosticsSignal({ ...diagnostics, overall: undefined })) {
    return { score: 0, confidence: 0, status: 'insufficient_data' };
  }

  if (topSeverity >= 2) {
    return {
      score: topSeverity === 3 ? 0.38 : 0.52,
      confidence: 0.55,
      status: 'risk',
    };
  }

  if (diagnostics.strongSides.length >= 2 && diagnostics.riskZones.length === 0) {
    return { score: 0.78, confidence: 0.55, status: 'strong' };
  }

  return { score: 0.62, confidence: 0.5, status: 'neutral' };
};

const toCompactDiagnostics = (
  passport?: PairType['passport']
): PairCompactDiagnosticsDTO => {
  const passportWithOverall = passport as PairPassportWithOverall | undefined;
  const compactWithoutOverall: Omit<PairCompactDiagnosticsDTO, 'overall'> = {
    strongSides:
      passport?.strongSides?.map((item) => ({
        axis: item.axis,
        facets: item.facets ?? [],
      })) ?? [],
    riskZones:
      passport?.riskZones?.map((item) => ({
        axis: item.axis,
        facets: item.facets ?? [],
        severity: normalizeSeverity(item.severity),
      })) ?? [],
    complementMap:
      passport?.complementMap?.map((item) => ({
        axis: item.axis,
        A_covers_B: item.A_covers_B ?? [],
        B_covers_A: item.B_covers_A ?? [],
      })) ?? [],
    levelDelta:
      passport?.levelDelta?.map((item) => ({
        axis: item.axis,
        delta: Number.isFinite(item.delta) ? item.delta : 0,
      })) ?? [],
    lastDiagnosticsAt: toIso(passport?.lastDiagnosticsAt),
  };
  const normalizedOverall = normalizeOverall(passportWithOverall?.overall);

  return {
    ...compactWithoutOverall,
    overall: normalizedOverall ?? inferOverallFromPassport(compactWithoutOverall),
  };
};

const withAvatarUrl = (member: PublicPairMemberDTO): PublicPairMemberDTO => ({
  ...member,
  avatarUrl: toDiscordAvatarUrl(member.id, member.avatar),
});

const fallbackMember = (id: string): PublicPairMemberDTO =>
  withAvatarUrl({
    id,
    username: 'Участник пары',
    avatar: '',
  });

const axisLabel = (axis?: string): string => (axis ? AXIS_LABELS[axis] ?? 'эта зона' : 'эта зона');

const buildNextStep = (input: {
  pairId: string;
  diagnostics: PairCompactDiagnosticsDTO;
  weekly: PairWeeklyCheckInSummaryDTO;
  hasCurrentActivity: boolean;
}): PairNextStepDTO => {
  const overall = input.diagnostics.overall;
  const topRisk = input.diagnostics.riskZones
    .slice()
    .sort((left, right) => right.severity - left.severity)[0];

  if (!input.weekly.currentUser.submitted) {
    return {
      kind: 'complete_weekly_checkin',
      title: 'Заполните weekly check-in',
      description:
        'Короткая еженедельная сверка обновит состояние пары и поможет точнее выбрать следующий шаг.',
      href: '#weekly-checkin',
      ctaLabel: 'Перейти к check-in',
    };
  }

  if (!input.weekly.peer.submitted) {
    return {
      kind: 'wait_or_invite_peer_checkin',
      title: 'Ответ партнёра пока не готов',
      description:
        'Ваш check-in уже сохранён. Сводка пары станет точнее, когда партнёр тоже ответит.',
      href: '#weekly-checkin',
      ctaLabel: 'Посмотреть статус',
    };
  }

  if (input.weekly.pair.hasDivergence) {
    return {
      kind: 'review_weekly_divergence',
      title: 'Спокойно сверьте состояние недели',
      description:
        'По ответам этой недели есть заметное расхождение. Лучше выбрать короткий разговор или лёгкую коммуникационную активность без давления.',
      href: '/couple-activity',
      ctaLabel: 'Выбрать лёгкую активность',
    };
  }

  if (input.hasCurrentActivity) {
    return {
      kind: 'complete_current_activity',
      title: 'Продолжите текущую активность',
      description:
        'У пары уже есть активное действие. Лучше довести его до результата, чем начинать новое.',
      href: '/couple-activity',
      ctaLabel: 'Открыть активности',
    };
  }

  if ((input.weekly.pair.fatigue ?? 0) >= 0.7) {
    return {
      kind: 'suggest_activity',
      title: 'Выберите лёгкую активность',
      description:
        'По ответам этой недели усталость высокая, поэтому лучше взять мягкий формат без тяжёлого разговора.',
      href: '/couple-activity',
      ctaLabel: 'Получить активность',
    };
  }

  if (
    !hasDiagnosticsSignal(input.diagnostics) ||
    !overall ||
    overall.status === 'insufficient_data' ||
    overall.confidence < 0.35
  ) {
    return {
      kind: 'run_pair_diagnostics',
      title: 'Пройдите диагностику пары',
      description:
        'Пока мало данных для честного вывода. Диагностика поможет увидеть сильные стороны и зоны риска без догадок.',
      href: `/pair/${input.pairId}/diagnostics`,
      ctaLabel: 'Открыть диагностику',
    };
  }

  if (topRisk && topRisk.severity >= 2) {
    return {
      kind: 'review_risk_zone',
      title: `Обсудите риск-зону: ${axisLabel(topRisk.axis)}`,
      description:
        topRisk.severity === 3
          ? 'Это высокий сигнал напряжения. Лучше выбрать короткое действие и договориться о правилах разговора заранее.'
          : 'Это не приговор, но сигнал. Небольшая активность поможет обсудить тему без перегруза.',
      href: '/couple-activity',
      ctaLabel: 'Подобрать активность',
      axis: topRisk.axis,
      severity: topRisk.severity,
    };
  }

  return {
    kind: 'suggest_activity',
    title: 'Получите новую активность',
    description:
      'Состояние пары не требует срочного шага. Можно выбрать короткое действие, которое поддержит общий ритм.',
    href: '/couple-activity',
    ctaLabel: 'Получить активность',
  };
};

export const buildPairDashboardSummary = async (input: {
  pair: PairDoc;
  currentUserId: string;
}) => {
  await connectToDatabase();

  const pair = input.pair;
  const pairId = pair._id as Types.ObjectId;
  const [a, b] = pair.members;

  const [current, suggestedCount, lastLike, memberDocs, weeklySummary] =
    await Promise.all([
      PairActivity.findOne({
        pairId,
        status: { $in: ['accepted', 'in_progress', 'awaiting_checkin'] },
      })
        .sort({ createdAt: -1 })
        .lean(),
      PairActivity.countDocuments({ pairId, status: 'offered' }),
      Like.findOne({
        status: 'paired',
        $or: [{ fromId: a, toId: b }, { fromId: b, toId: a }],
      })
        .sort({ updatedAt: -1 })
        .lean(),
      User.find({ id: { $in: pair.members } })
        .select({ id: 1, username: 1, avatar: 1 })
        .lean<PublicUserSource[]>(),
      buildPairWeeklyCheckInSummary({
        pair,
        currentUserId: input.currentUserId,
      }),
    ]);

  const memberById = new Map(
    memberDocs.map((member) => {
      const dto = toUserDTO(member, { scope: 'public' });
      return [member.id, withAvatarUrl(dto)];
    })
  );
  const members = pair.members.map((memberId) => memberById.get(memberId) ?? fallbackMember(memberId));
  const peerId = pair.members.find((memberId) => memberId !== input.currentUserId) ?? null;
  const peer = peerId ? memberById.get(peerId) ?? fallbackMember(peerId) : null;
  const diagnostics = toCompactDiagnostics(pair.passport);
  const nextStep = buildNextStep({
    pairId: String(pairId),
    diagnostics,
    weekly: weeklySummary,
    hasCurrentActivity: Boolean(current),
  });

  return {
    pair: toPairDTO(pair, { includePassport: true, includeMetrics: true }),
    members,
    peer,
    currentActivity: current ? toPairActivityDTO(current, { includeAnswers: false }) : null,
    suggestedCount,
    lastLike: lastLike ? toLikeSummaryDTO(lastLike) : null,
    diagnostics,
    hasCurrentWeeklyCheckIn: weeklySummary.currentUser.submitted,
    nextStep,
  };
};
