import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity } from '@/models/PairActivity';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { User, type UserType } from '@/models/User';
import type { PairType } from '@/models/Pair';
import { toPairActivityDTO, toPairDTO, toUserDTO } from '@/lib/dto';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import {
  weeklyCycleService,
  type CurrentWeeklyCycleDTO,
} from '@/domain/services/weeklyCycle.service';
import { isPairSafetyVetoActive } from '@/domain/services/safetyGate.service';
import {
  isActivityAccessibleToRole,
  isOfferedActivityEligibleForRole,
} from '@/domain/services/activityEligibility.service';

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
  const inferredOverall = hasDiagnosticsSignal({
    ...compactWithoutOverall,
    overall: undefined,
  })
    ? inferOverallFromPassport(compactWithoutOverall)
    : undefined;

  return {
    ...compactWithoutOverall,
    overall: normalizedOverall ?? inferredOverall,
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

const buildNextStep = (input: {
  pairStatus: PairType['status'];
  weekly: CurrentWeeklyCycleDTO;
  hasCurrentActivity: boolean;
}): PairNextStepDTO => {
  if (input.pairStatus !== 'active') {
    return {
      kind: 'none',
      title: input.pairStatus === 'paused' ? 'Пара сейчас на паузе' : 'Пара завершена',
      description:
        input.pairStatus === 'paused'
          ? 'Возобновите пару, чтобы получать новые совместные активности.'
          : 'Для завершённой пары новые активности не создаются.',
    };
  }

  if (input.hasCurrentActivity) {
    return {
      kind: 'complete_current_activity',
      title: 'Завершите текущую активность',
      description:
        'У пары уже есть активная задача. Лучше завершить её, прежде чем брать новую.',
      href: '/couple-activity',
      ctaLabel: 'Открыть активность',
    };
  }

  if (input.weekly.currentUser.completionStatus === 'PENDING') {
    return {
      kind: 'complete_weekly_checkin',
      title: 'Заполните weekly check-in',
      description:
        'Короткая еженедельная сверка обновит состояние пары и поможет точнее выбрать следующий шаг.',
      href: '#weekly-checkin',
      ctaLabel: 'Перейти к check-in',
    };
  }

  if (
    input.weekly.currentUser.completionStatus === 'SKIPPED' ||
    input.weekly.currentUser.completionStatus === 'EXPIRED'
  ) {
    return {
      kind: 'suggest_activity',
      title: 'Выберите только посильный следующий шаг',
      description:
        'Check-in можно пропустить без штрафа. Если хочется продолжить, выберите нейтральный формат с небольшой нагрузкой.',
      href: '/couple-activity',
      ctaLabel: 'Открыть лёгкие активности',
    };
  }

  if (input.weekly.peer.completionStatus === 'PENDING') {
    return {
      kind: 'wait_or_invite_peer_checkin',
      title: 'Ответ партнёра пока не готов',
      description:
        'Ваш check-in уже сохранён. Сводка пары станет точнее, когда партнёр тоже ответит.',
      href: '#weekly-checkin',
      ctaLabel: 'Посмотреть статус',
    };
  }

  if (input.weekly.pair.dataStatus === 'INSUFFICIENT') {
    return {
      kind: 'suggest_activity',
      title: 'Общих данных пока недостаточно',
      description:
        'Индивидуальные ответы остаются личными. Можно выбрать нейтральный формат с небольшой нагрузкой.',
      href: '/couple-activity',
      ctaLabel: 'Открыть лёгкие активности',
    };
  }

  if (input.weekly.pair.signals.some((signal) => signal.status === 'MIXED')) {
    return {
      kind: 'review_weekly_divergence',
      title: 'Спокойно сверьте состояние недели',
      description:
        'Опыт недели ощущается по-разному. Лучше выбрать короткий нейтральный формат без давления.',
      href: '/couple-activity',
      ctaLabel: 'Выбрать лёгкую активность',
    };
  }

  if (
    input.weekly.pair.signals.some(
      (signal) =>
        (signal.key === 'tension' && signal.status === 'HIGH') ||
        (signal.key === 'recovery' && signal.status === 'LOW') ||
        (signal.key === 'resource' && signal.status === 'LOW')
    )
  ) {
    return {
      kind: 'suggest_activity',
      title: 'Выберите лёгкую активность',
      description:
        'Безопасная сводка предлагает снизить нагрузку и не начинать тяжёлый разговор.',
      href: '/couple-activity',
      ctaLabel: 'Получить активность',
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
  const [
    currentCandidates,
    offeredCandidates,
    offeredDecisions,
    memberDocs,
    currentCycle,
    safetyVeto,
  ] =
    await Promise.all([
      PairActivity.find({
        pairId,
        status: { $in: ['accepted', 'in_progress', 'awaiting_checkin'] },
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      PairActivity.find({ pairId, status: 'offered' })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      RecommendationDecision.find({ pairId, status: 'OFFERED' })
        .select({ activityId: 1 })
        .lean<Array<{ activityId: Types.ObjectId }>>(),
      User.find({ id: { $in: pair.members } })
        .select({ id: 1, username: 1, avatar: 1 })
        .lean<PublicUserSource[]>(),
      weeklyCycleService.current({
        pair: input.pair,
        currentUserId: input.currentUserId,
      }),
      isPairSafetyVetoActive(String(pairId)),
    ]);

  const role: 'A' | 'B' =
    pair.members[0] === input.currentUserId ? 'A' : 'B';
  const current = currentCandidates.find(
    (activity) =>
      isActivityAccessibleToRole(activity, role) &&
      (!safetyVeto ||
        isOfferedActivityEligibleForRole({
          activity,
          role,
          safetyVeto,
        }))
  );
  const canonicalOfferedIds = new Set(
    offeredDecisions.map((decision) => String(decision.activityId))
  );
  const suggestedCount = Math.min(
    1,
    offeredCandidates.filter(
      (activity) =>
        canonicalOfferedIds.has(String(activity._id)) &&
        isOfferedActivityEligibleForRole({ activity, role, safetyVeto })
    ).length
  );

  const memberById = new Map(
    memberDocs.map((member) => {
      const dto = toUserDTO(member, { scope: 'public' });
      return [member.id, withAvatarUrl(dto)];
    })
  );
  const members = pair.members.map((memberId) => memberById.get(memberId) ?? fallbackMember(memberId));
  const peerId = pair.members.find((memberId) => memberId !== input.currentUserId) ?? null;
  const peer = peerId ? memberById.get(peerId) ?? fallbackMember(peerId) : null;
  // Legacy questionnaire diagnostics can reveal exact pair-derived values. The
  // current pair surface uses only the privacy-filtered weekly projection.
  const diagnostics = toCompactDiagnostics(undefined);
  const nextStep = buildNextStep({
    pairStatus: pair.status,
    weekly: currentCycle,
    hasCurrentActivity: Boolean(current),
  });

  return {
    pair: toPairDTO(pair, { includePassport: false, includeMetrics: false }),
    members,
    peer,
    currentActivity: current ? toPairActivityDTO(current, { includeAnswers: false }) : null,
    suggestedCount,
    lastLike: null,
    diagnostics,
    hasCurrentWeeklyCheckIn:
      currentCycle.currentUser.completionStatus === 'SUBMITTED',
    nextStep,
  };
};
