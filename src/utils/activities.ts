import type { CheckInTpl } from '@/models/ActivityTemplate';
import type {
  ActivityCompletedStatus,
  ActivityFeedbackSchemaVersion,
  ActivityResultSummary,
  Answer,
} from '@/models/PairActivity';

export const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));

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

export const ACTIVITY_FEEDBACK_POLICY_VERSION =
  'activity-feedback-policy-v1' as const;
export const ACTIVITY_FEEDBACK_PAIR_MODEL_CONSENT_REVISION =
  'activity-feedback-pair-model-consent-v1' as const;
export const ACTIVITY_FEEDBACK_PRIVATE_CONSENT_REVISION =
  'not-granted' as const;

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
  feedbackRevision: number;
  allowPairModelUse: boolean;
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
      feedbackRevision: input.feedbackRevision,
      captureMode: input.allowPairModelUse
        ? ('PAIR_MODEL_ONLY' as const)
        : ('PRIVATE' as const),
      policyVersion: ACTIVITY_FEEDBACK_POLICY_VERSION,
      consentRevision: input.allowPairModelUse
        ? ACTIVITY_FEEDBACK_PAIR_MODEL_CONSENT_REVISION
        : ACTIVITY_FEEDBACK_PRIVATE_CONSENT_REVISION,
    })),
  ];
};

export function normalizeUI(checkIn: CheckInTpl, ui: number): number {
  const index = Math.max(0, Math.min((ui ?? 1) - 1, checkIn.map.length - 1));
  const value = checkIn.map[index] ?? 0;
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
    const average = values.reduce((sum, current) => sum + current, 0) / values.length;
    const weight = checkIn.weight ?? 1;
    numerator += average * weight;
    denominator += weight;
  }
  return denominator ? clamp(numerator / denominator) : 0;
}

const averageForCheckIn = (
  checkIns: CheckInTpl[],
  answers: Answer[],
  checkInId: string,
  role?: 'A' | 'B'
): number | undefined => {
  const checkIn = checkIns.find((item) => item.id === checkInId);
  if (!checkIn) return undefined;
  const values = answers
    .filter(
      (answer) => answer.checkInId === checkInId && (!role || answer.by === role)
    )
    .map((answer) => normalizeUI(checkIn, answer.ui));
  if (!values.length) return undefined;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
};

export type ActivityRoleEvidenceMetrics = {
  successScore: number;
  participation?: number;
  usefulness?: number;
  subjectiveChange?: number;
  difficulty?: number;
  repeatIntent?: number;
};

export const activityRoleEvidenceMetrics = (input: {
  checkIns: CheckInTpl[];
  answers: Answer[];
  role: 'A' | 'B';
}): ActivityRoleEvidenceMetrics | undefined => {
  const roleAnswers = input.answers.filter((answer) => answer.by === input.role);
  if (!roleAnswers.length) return undefined;
  return {
    successScore: successScore(input.checkIns, roleAnswers),
    participation: averageForCheckIn(
      input.checkIns,
      input.answers,
      'participated',
      input.role
    ),
    usefulness: averageForCheckIn(
      input.checkIns,
      input.answers,
      'usefulness',
      input.role
    ),
    subjectiveChange: averageForCheckIn(
      input.checkIns,
      input.answers,
      'subjective_change',
      input.role
    ),
    difficulty: averageForCheckIn(
      input.checkIns,
      input.answers,
      'difficulty',
      input.role
    ),
    repeatIntent:
      averageForCheckIn(
        input.checkIns,
        input.answers,
        'repeat_intent',
        input.role
      ) ??
      averageForCheckIn(
        input.checkIns,
        input.answers,
        'want_similar',
        input.role
      ),
  };
};

const resultExplanation = (
  status: ActivityCompletedStatus,
  bothSubmitted: boolean
): ActivityResultSummary['explanation'] => {
  if (!bothSubmitted) {
    return {
      ru: 'Результат предварительный: ответил один участник. Его ответ сохранён отдельно.',
      en: 'The result is preliminary because one participant responded. Their feedback was stored separately.',
    };
  }
  if (status === 'completed_success') {
    return {
      ru: 'Оба участника отметили положительный результат активности.',
      en: 'Both participants reported a positive activity outcome.',
    };
  }
  if (status === 'failed') {
    return {
      ru: 'Формат не дал устойчивого положительного результата. Это учтено без оценки участников.',
      en: 'The format did not produce a reliable positive outcome. This is recorded without judging either participant.',
    };
  }
  return {
    ru: 'Активность подошла частично. Следующий формат можно сделать мягче.',
    en: 'The activity worked partially. A gentler next format may fit better.',
  };
};

const emptyFactorEvidence = (recordedAt: Date) => ({
  taskResultEventIds: [],
  pairActivityEventIds: [],
  individualSnapshotIds: [],
  pairSnapshotIds: [],
  pairEvaluationSnapshotIds: [],
  recordedAt,
});

export const buildActivityResultSummary = (input: {
  checkIns?: CheckInTpl[];
  answers?: Answer[];
  completedAt?: Date;
  feedbackSchemaVersion?: ActivityFeedbackSchemaVersion;
}): ActivityResultSummary => {
  const feedbackSchemaVersion =
    input.feedbackSchemaVersion ?? 'activity-feedback-v2';
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
  const wantsSimilarRatio =
    averageForCheckIn(checkIns, answers, 'repeat_intent') ??
    averageForCheckIn(checkIns, answers, 'want_similar');
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
  const difficultyAvg = averageForCheckIn(checkIns, answers, 'difficulty');
  const aMetrics = activityRoleEvidenceMetrics({ checkIns, answers, role: 'A' });
  const bMetrics = activityRoleEvidenceMetrics({ checkIns, answers, role: 'B' });
  const strongDivergence =
    aMetrics &&
    bMetrics &&
    Math.abs(aMetrics.successScore - bMetrics.successScore) >= 0.35;
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

  const recordedAt = input.completedAt ?? new Date();
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
    factorEvidenceRecorded: false,
    factorEvidence: emptyFactorEvidence(recordedAt),
    explanation: resultExplanation(status, bothSubmitted),
    completedAt: input.completedAt,
    resultVersion: 'activity-result-v2',
  };
};

export const hasActivityFeedback = (
  result: Pick<ActivityResultSummary, 'submittedCount'>
): boolean => result.submittedCount > 0;

export const shouldRecordActivityFactorEvidence = (
  result: Pick<ActivityResultSummary, 'factorEvidenceRecorded'>
): boolean => !result.factorEvidenceRecorded;

export const refineActivityResultSummary = (input: {
  previous: ActivityResultSummary;
  next: ActivityResultSummary;
}): ActivityResultSummary => ({
  ...input.next,
  factorEvidenceRecorded: false,
  factorEvidence: input.previous.factorEvidence,
  explanation: {
    ru: `${input.next.explanation.ru} Итог уточнён без повторного учёта данных.`,
    en: `${input.next.explanation.en ?? ''} The result was refined without recording duplicate evidence.`.trim(),
  },
});
