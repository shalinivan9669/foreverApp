import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { User, type UserType } from '@/models/User';
import type { PairType } from '@/models/Pair';
import { toPairActivityDTO, toPairDTO, toUserDTO } from '@/lib/dto';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import {
  weeklyCycleService,
  type CurrentWeeklyCycleDTO,
} from '@/domain/services/weeklyCycle.service';
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

type PairNextStepDTO = {
  kind:
    | 'complete_weekly_checkin'
    | 'wait_or_invite_peer_checkin'
    | 'review_weekly_divergence'
    | 'complete_current_activity'
    | 'suggest_activity'
    | 'none';
  title: string;
  description: string;
  href?: string;
  ctaLabel?: string;
};

type PublicUserSource = Pick<UserType, 'id' | 'username' | 'avatar'>;

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
  currentActivity?: {
    id: string;
    pairId: string;
    status: PairActivityType['status'];
    ownFeedbackSubmitted: boolean;
    peerFeedbackSubmitted: boolean;
  };
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

  if (input.currentActivity) {
    const activity = input.currentActivity;
    const target = new URLSearchParams({ pairId: activity.pairId, activityId: activity.id });
    if (activity.ownFeedbackSubmitted) {
      target.set('action', 'result');
      return {
        kind: 'complete_current_activity',
        title: activity.peerFeedbackSubmitted ? 'Отзывы обоих сохранены' : 'Ваш отзыв сохранён — ждём партнёра',
        description: activity.peerFeedbackSubmitted
          ? 'Откройте активность, чтобы посмотреть результат. Повторно отвечать не нужно.'
          : 'Ваш шаг уже выполнен. Партнёр оставит собственный отзыв; повторно отвечать не нужно.',
        href: `/couple-activity?${target.toString()}`,
        ctaLabel: activity.peerFeedbackSubmitted ? 'Посмотреть результат' : 'Посмотреть статус',
      };
    }
    if (activity.status === 'awaiting_feedback' || activity.status === 'awaiting_checkin') {
      target.set('action', 'feedback');
      return {
        kind: 'complete_current_activity',
        title: 'Поделитесь впечатлениями от активности',
        description: 'Ваш личный отзыв ещё не сохранён. Кнопка откроет форму именно этой активности.',
        href: `/couple-activity?${target.toString()}`,
        ctaLabel: 'Оставить отзыв',
      };
    }
    return {
      kind: 'complete_current_activity',
      title: 'Завершите текущую активность',
      description:
        'У пары уже есть активная задача. Лучше завершить её, прежде чем брать новую.',
      href: `/couple-activity?${target.toString()}`,
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

const buildPairDashboardSummaryUncoalesced = async (input: {
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
  ] =
    await Promise.all([
      PairActivity.find({
        pairId,
        status: {
          $in: [
            'accepted',
            'in_progress',
            'awaiting_feedback',
            'awaiting_checkin',
          ],
        },
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
    ]);

  const role: 'A' | 'B' =
    pair.members[0] === input.currentUserId ? 'A' : 'B';
  const current = currentCandidates.find(
    (activity) => isActivityAccessibleToRole(activity, role)
  );
  const canonicalOfferedIds = new Set(
    offeredDecisions.map((decision) => String(decision.activityId))
  );
  const suggestedCount = Math.min(
    1,
    offeredCandidates.filter(
      (activity) =>
        canonicalOfferedIds.has(String(activity._id)) &&
        isOfferedActivityEligibleForRole({
          activity,
          role,
          safetyVeto: false,
        })
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
  const nextStep = buildNextStep({
    pairStatus: pair.status,
    weekly: currentCycle,
    currentActivity: current ? {
      id: String(current._id),
      pairId: String(pairId),
      status: current.status,
      ownFeedbackSubmitted: (current.answers ?? []).some((answer) => answer.by === role),
      peerFeedbackSubmitted: (current.answers ?? []).some((answer) => answer.by !== role),
    } : undefined,
  });

  return {
    pair: toPairDTO(pair),
    members,
    peer,
    currentActivity: current ? toPairActivityDTO(current, { includeAnswers: false }) : null,
    suggestedCount,
    hasCurrentWeeklyCheckIn:
      currentCycle.currentUser.completionStatus === 'SUBMITTED',
    nextStep,
  };
};

type PairDashboardSummary = Awaited<
  ReturnType<typeof buildPairDashboardSummaryUncoalesced>
>;

const dashboardSummaryFlights = new Map<
  string,
  Promise<PairDashboardSummary>
>();

export const buildPairDashboardSummary = (input: {
  pair: PairDoc;
  currentUserId: string;
}): Promise<PairDashboardSummary> => {
  const flightKey = `${String(input.pair._id)}:${input.currentUserId}`;
  const existingFlight = dashboardSummaryFlights.get(flightKey);
  if (existingFlight) return existingFlight;

  const flight = buildPairDashboardSummaryUncoalesced(input);
  dashboardSummaryFlights.set(flightKey, flight);
  const clearFlight = () => {
    if (dashboardSummaryFlights.get(flightKey) === flight) {
      dashboardSummaryFlights.delete(flightKey);
    }
  };
  void flight.then(clearFlight, clearFlight);
  return flight;
};
