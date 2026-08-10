import { Types, type ClientSession } from 'mongoose';
import { User } from '@/models/User';
import { Pair } from '@/models/Pair';
import { VectorSnapshot, type VectorSnapshotType } from '@/models/VectorSnapshot';
import type { CheckInTpl, EffectTpl, Axis } from '@/models/ActivityTemplate';
import type {
  ActivityCompletedStatus,
  ActivityFeedbackSchemaVersion,
  ActivityResultSummary,
  Answer,
} from '@/models/PairActivity';
import {
  DEFAULT_SCORING_CONFIG,
  createVectorSnapshot,
  readAxisLayer,
  recalculateDisplayedVector,
} from '@/domain/services/vectorScoring.service';

export const clamp = (x: number, a = 0, b = 1) =>
  Math.max(a, Math.min(b, x));

export const UNIVERSAL_ACTIVITY_COMPLETION_CHECKINS: CheckInTpl[] = [
  {
    id: 'usefulness',
    scale: 'likert5',
    text: {
      ru: 'Насколько это было полезно?',
      en: 'How useful was this?',
    },
    map: [-2, -1, 0, 1, 2],
    weight: 1.2,
  },
  {
    id: 'comfort',
    scale: 'likert5',
    text: {
      ru: 'Насколько комфортно это было?',
      en: 'How comfortable was this?',
    },
    map: [-2, -1, 0, 1, 2],
    weight: 1,
  },
  {
    id: 'tension',
    scale: 'likert5',
    text: {
      ru: 'После задания стало спокойнее или напряжённее?',
      en: 'Did it reduce or increase tension?',
    },
    map: [-2, -1, 0, 1, 2],
    weight: 1,
  },
  {
    id: 'want_similar',
    scale: 'bool',
    text: {
      ru: 'Хотите похожие задания в будущем?',
      en: 'Would you like similar activities in the future?',
    },
    map: [0, 1],
    weight: 0.6,
  },
];

export const CANONICAL_ACTIVITY_FEEDBACK_CHECKINS: CheckInTpl[] = [
  {
    id: 'participated',
    scale: 'bool',
    text: {
      ru: 'Вы участвовали в активности?',
      en: 'Did you participate in the activity?',
    },
    map: [0, 1],
    weight: 1,
  },
  {
    id: 'usefulness',
    scale: 'likert5',
    text: {
      ru: 'Насколько полезной оказалась активность?',
      en: 'How useful was the activity?',
    },
    map: [-2, -1, 0, 1, 2],
    weight: 1.2,
  },
  {
    id: 'subjective_change',
    scale: 'likert5',
    text: {
      ru: 'Как изменилось ваше состояние после активности?',
      en: 'How did you feel after the activity?',
    },
    map: [-2, -1, 0, 1, 2],
    weight: 1,
  },
  {
    id: 'difficulty',
    scale: 'likert5',
    text: {
      ru: 'Насколько сложной была активность?',
      en: 'How difficult was the activity?',
    },
    map: [1, 2, 3, 4, 5],
    weight: 0,
  },
  {
    id: 'repeat_intent',
    scale: 'bool',
    text: {
      ru: 'Хотели бы вы повторить похожий формат?',
      en: 'Would you repeat a similar format?',
    },
    map: [0, 1],
    weight: 0.6,
  },
];

export const effectiveActivityCheckIns = (
  checkIns?: CheckInTpl[],
  feedbackSchemaVersion: ActivityFeedbackSchemaVersion = 'activity-feedback-v1'
): CheckInTpl[] => {
  if (feedbackSchemaVersion === 'activity-feedback-v1') {
    return checkIns?.length ? checkIns : UNIVERSAL_ACTIVITY_COMPLETION_CHECKINS;
  }

  const merged = [...(checkIns ?? [])];
  const existingIds = new Set(merged.map((checkIn) => checkIn.id));
  for (const canonical of CANONICAL_ACTIVITY_FEEDBACK_CHECKINS) {
    if (!existingIds.has(canonical.id)) {
      merged.push(canonical);
      existingIds.add(canonical.id);
    }
  }
  return merged;
};

export const replaceActivityAnswers = (input: {
  existing: Answer[];
  incoming: Array<{ checkInId: string; ui: number }>;
  role: 'A' | 'B';
  at: Date;
}): Answer[] => {
  const incomingIds = new Set(input.incoming.map((answer) => answer.checkInId));
  return [
    ...input.existing.filter(
      (answer) =>
        answer.by !== input.role || !incomingIds.has(answer.checkInId)
    ),
    ...input.incoming.map((answer) => ({
      ...answer,
      by: input.role,
      at: input.at,
    })),
  ];
};

export function normalizeUI(checkIn: CheckInTpl, ui: number): number {
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, checkIn.map.length - 1));
  const value = checkIn.map[idx] ?? 0;
  const min = Math.min(...checkIn.map);
  const max = Math.max(...checkIn.map);
  if (min === max) return value > 0 ? 1 : 0;
  return clamp((value - min) / (max - min));
}

export function successScore(
  checkIns: CheckInTpl[],
  answers: Array<{ checkInId: string; by: 'A' | 'B'; ui: number }>
): number {
  if (!checkIns.length) return 0;

  const grouped = new Map<string, number[]>();
  for (const answer of answers) {
    const checkIn = checkIns.find((item) => item.id === answer.checkInId);
    if (!checkIn) continue;
    const value = normalizeUI(checkIn, answer.ui);
    grouped.set(checkIn.id, [...(grouped.get(checkIn.id) ?? []), value]);
  }

  let numerator = 0;
  let denominator = 0;
  for (const checkIn of checkIns) {
    const values = grouped.get(checkIn.id) ?? [];
    if (!values.length) continue;
    const value =
      values.reduce((sum, current) => sum + current, 0) / values.length;
    const weight = checkIn.weight ?? 1;
    numerator += value * weight;
    denominator += weight;
  }

  return denominator ? clamp(numerator / denominator) : 0;
}

const averageForCheckIn = (
  checkIns: CheckInTpl[],
  answers: Answer[],
  checkInId: string
): number | undefined => {
  const checkIn = checkIns.find((item) => item.id === checkInId);
  if (!checkIn) return undefined;
  const values = answers
    .filter((answer) => answer.checkInId === checkInId)
    .map((answer) => normalizeUI(checkIn, answer.ui));
  if (!values.length) return undefined;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const roleScore = (
  checkIns: CheckInTpl[],
  answers: Answer[],
  role: 'A' | 'B'
): number | undefined => {
  const roleAnswers = answers.filter((answer) => answer.by === role);
  return roleAnswers.length ? successScore(checkIns, roleAnswers) : undefined;
};

const resultExplanation = (
  status: ActivityCompletedStatus,
  bothSubmitted: boolean
): ActivityResultSummary['effectExplanation'] => {
  if (!bothSubmitted) {
    return {
      ru: 'Результат предварительный: ответил один участник. Эффект применён осторожно.',
      en: 'The result is preliminary because one participant responded. The effect was limited.',
    };
  }
  if (status === 'completed_success') {
    return {
      ru: 'Активность подошла хорошо. Состояние пары обновлено умеренно.',
      en: 'The activity worked well. The pair state was updated moderately.',
    };
  }
  if (status === 'failed') {
    return {
      ru: 'Формат не дал устойчивого положительного результата. Положительный эффект не применён.',
      en: 'The format did not produce a reliable positive result. No positive effect was applied.',
    };
  }
  return {
    ru: 'Активность подошла частично. Следующий формат лучше сделать мягче.',
    en: 'The activity worked partially. A gentler next format is preferable.',
  };
};

export const buildActivityResultSummary = (input: {
  checkIns?: CheckInTpl[];
  answers?: Answer[];
  completedAt?: Date;
  feedbackSchemaVersion?: ActivityFeedbackSchemaVersion;
}): ActivityResultSummary => {
  const feedbackSchemaVersion =
    input.feedbackSchemaVersion ?? 'activity-feedback-v1';
  const checkIns = effectiveActivityCheckIns(
    input.checkIns,
    feedbackSchemaVersion
  );
  const answers = input.answers ?? [];
  const submittedBy = (['A', 'B'] as const).filter((role) =>
    answers.some((answer) => answer.by === role)
  );
  const bothSubmitted = submittedBy.length === 2;
  const score = successScore(checkIns, answers);
  const usefulnessAvg = averageForCheckIn(checkIns, answers, 'usefulness');
  const comfortAvg = averageForCheckIn(checkIns, answers, 'comfort');
  const calmnessAvg = averageForCheckIn(checkIns, answers, 'tension');
  const tensionAvg =
    typeof calmnessAvg === 'number' ? clamp(1 - calmnessAvg) : undefined;
  const wantsSimilarRatio = averageForCheckIn(
    checkIns,
    answers,
    'repeat_intent'
  ) ?? averageForCheckIn(checkIns, answers, 'want_similar');
  const participationRatio = averageForCheckIn(
    checkIns,
    answers,
    'participated'
  );
  const subjectiveChangeAvg = averageForCheckIn(
    checkIns,
    answers,
    'subjective_change'
  );
  const difficultyAvg = averageForCheckIn(
    checkIns,
    answers,
    'difficulty'
  );
  const aScore = roleScore(checkIns, answers, 'A');
  const bScore = roleScore(checkIns, answers, 'B');
  const strongDivergence =
    typeof aScore === 'number' &&
    typeof bScore === 'number' &&
    Math.abs(aScore - bScore) >= 0.35;
  const clearlyNegative =
    bothSubmitted &&
    (score < 0.35 ||
      (typeof comfortAvg === 'number' && comfortAvg < 0.3) ||
      (typeof tensionAvg === 'number' && tensionAvg > 0.7));

  let status: ActivityCompletedStatus = 'completed_partial';
  if (clearlyNegative) {
    status = 'failed';
  } else if (bothSubmitted && score >= 0.7 && !strongDivergence) {
    status = 'completed_success';
  }

  return {
    submittedBy,
    submittedCount: submittedBy.length,
    bothSubmitted,
    successScore: clamp(score),
    status,
    usefulnessAvg,
    comfortAvg,
    tensionAvg,
    wantsSimilarRatio,
    participationRatio,
    subjectiveChangeAvg,
    difficultyAvg,
    feedbackSchemaVersion,
    effectApplied: false,
    effect: {
      fatigueDelta: 0,
      readinessDelta: 0,
      axisDeltas: [],
    },
    effectExplanation: resultExplanation(status, bothSubmitted),
    completedAt: input.completedAt,
    resultVersion: 'activity-result-v1',
  };
};

export const hasActivityFeedback = (
  result: Pick<ActivityResultSummary, 'submittedCount'>
): boolean => result.submittedCount > 0;

export const shouldApplyActivityEffect = (
  result: Pick<ActivityResultSummary, 'effectApplied'>
): boolean => !result.effectApplied;

export const refineActivityResultSummary = (input: {
  previous: ActivityResultSummary;
  next: ActivityResultSummary;
}): ActivityResultSummary => ({
  ...input.next,
  effectApplied: input.previous.effectApplied,
  effect: input.previous.effect,
  effectExplanation: {
    ru: `${input.next.effectExplanation.ru} Итог уточнён без повторного усиления эффекта.`,
    en: `${input.next.effectExplanation.en ?? ''} The result was refined without applying the effect twice.`.trim(),
  },
});

export const activityEffectMultiplier = (
  result: Pick<
    ActivityResultSummary,
    'successScore' | 'status' | 'bothSubmitted' | 'comfortAvg'
  >
): number => {
  if (result.status === 'failed') return 0;
  if (typeof result.comfortAvg === 'number' && result.comfortAvg < 0.35) {
    return 0;
  }
  const score = result.successScore;
  const base =
    score >= 0.75 ? 1 : score >= 0.5 ? 0.5 : score >= 0.35 ? 0.15 : 0;
  return result.bothSubmitted ? base : Math.min(base, 0.5);
};

export const scaleActivityPairDeltas = (input: {
  result: Pick<
    ActivityResultSummary,
    'successScore' | 'status' | 'bothSubmitted' | 'comfortAvg'
  >;
  fatigueDelta: number;
  readinessDelta: number;
}): { fatigueDelta: number; readinessDelta: number } => {
  const multiplier = activityEffectMultiplier(input.result);
  return {
    fatigueDelta: clamp(input.fatigueDelta * multiplier, -0.08, 0.08),
    readinessDelta:
      input.result.status === 'failed'
        ? Math.min(0, input.readinessDelta)
        : clamp(input.readinessDelta * multiplier, -0.06, 0.06),
  };
};

type EffectWithTarget = EffectTpl & { target?: 'A' | 'B' | 'both' };

export async function applyEffects(params: {
  pairDoc: InstanceType<typeof Pair>;
  members: [Types.ObjectId, Types.ObjectId];
  effect: EffectWithTarget[];
  result: ActivityResultSummary;
  fatigueDelta?: number;
  readinessDelta?: number;
  activityId: string;
  templateId?: string;
  primaryReason?: string;
  session?: ClientSession;
}): Promise<ActivityResultSummary['effect']> {
  const {
    pairDoc,
    members,
    effect,
    result,
    fatigueDelta = 0,
    readinessDelta = 0,
  } = params;
  const multiplier = activityEffectMultiplier(result);
  const users = await User.find({ _id: { $in: members } }).session(
    params.session ?? null
  );
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const fatigueFactor = 1 - Math.pow(pairDoc.fatigue?.score ?? 0, 2);
  const updatedAt = new Date();
  const vectorSnapshots: VectorSnapshotType[] = [];
  const axisDeltaTotals = new Map<Axis, { total: number; count: number }>();

  for (const item of effect) {
    const delta = item.baseDelta * multiplier * fatigueFactor;

    const bump = (user: (typeof users)[number]) => {
      const axis = item.axis as Axis;
      const vector = user.vectors[axis];
      const before = readAxisLayer(user, axis, 'trait');
      const nextLevel = clamp(vector.level + delta * 0.1);
      const appliedDelta = nextLevel - before.level;
      vector.level = nextLevel;
      if (
        result.successScore >= 0.6 &&
        multiplier > 0 &&
        item.facetsAdd?.length
      ) {
        vector.positives = Array.from(
          new Set([...(vector.positives ?? []), ...item.facetsAdd])
        );
      }
      const after = {
        ...before,
        level: nextLevel,
        positives: vector.positives ?? [],
        negatives: vector.negatives ?? [],
        scoringVersion: DEFAULT_SCORING_CONFIG.key,
        updatedAt,
      };
      vector.trait = after;
      vector.displayed = {
        ...recalculateDisplayedVector(after),
        updatedAt,
      };

      const snapshot = createVectorSnapshot({
        userId: user.id,
        pairId: String(pairDoc._id),
        layer: 'trait',
        axis,
        before,
        after,
        reason: {
          source: 'activity_completion',
          activityId: params.activityId,
          resultVersion: result.resultVersion,
          successScore: result.successScore,
          status: result.status,
          primaryReason: params.primaryReason,
          templateId: params.templateId,
        },
        scoringVersion: DEFAULT_SCORING_CONFIG.key,
        createdAt: updatedAt,
      });
      vectorSnapshots.push(snapshot);

      const current = axisDeltaTotals.get(axis) ?? { total: 0, count: 0 };
      axisDeltaTotals.set(axis, {
        total: current.total + appliedDelta,
        count: current.count + 1,
      });
    };

    const target = item.target ?? 'both';
    const userA = usersById.get(String(members[0]));
    const userB = usersById.get(String(members[1]));
    if (target === 'A' && userA) {
      bump(userA);
    } else if (target === 'B' && userB) {
      bump(userB);
    } else {
      if (userA) bump(userA);
      if (userB) bump(userB);
    }
  }

  for (const user of users) {
    await user.save(params.session ? { session: params.session } : undefined);
  }
  if (vectorSnapshots.length > 0) {
    if (params.session) {
      await VectorSnapshot.insertMany(vectorSnapshots, {
        session: params.session,
      });
    } else {
      await VectorSnapshot.insertMany(vectorSnapshots);
    }
  }

  const scaledPairDeltas = scaleActivityPairDeltas({
    result,
    fatigueDelta,
    readinessDelta,
  });
  const previousFatigue = pairDoc.fatigue?.score ?? 0;
  const previousReadiness = pairDoc.readiness?.score ?? 0;
  const nextFatigue = clamp(previousFatigue + scaledPairDeltas.fatigueDelta);
  const nextReadiness = clamp(
    previousReadiness + scaledPairDeltas.readinessDelta
  );
  pairDoc.fatigue = { score: nextFatigue, updatedAt };
  pairDoc.readiness = { score: nextReadiness, updatedAt };
  pairDoc.progress = {
    streak: pairDoc.progress?.streak ?? 0,
    completed: (pairDoc.progress?.completed ?? 0) + 1,
  };
  await pairDoc.save(params.session ? { session: params.session } : undefined);

  return {
    fatigueDelta: nextFatigue - previousFatigue,
    readinessDelta: nextReadiness - previousReadiness,
    axisDeltas: Array.from(axisDeltaTotals.entries()).map(([axis, value]) => ({
      axis,
      delta: value.count ? value.total / value.count : 0,
    })),
  };
}
