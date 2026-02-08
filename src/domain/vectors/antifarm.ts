const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const PERSONAL_VECTOR_COOLDOWN_DAYS = 7;
export const PERSONAL_BULK_COOLDOWN_KEY = 'bulk';

type CooldownMap = Record<string, Date | string> | Map<string, Date | string>;

export type PersonalVectorsMeta = {
  personalQuestionnaireCooldowns?: CooldownMap;
};

export type PersonalCooldownReason = 'APPLIED' | 'COOLDOWN';

export type PersonalCooldownDecision = {
  applied: boolean;
  reason: PersonalCooldownReason;
  questionnaireKey: string;
  cooldownDays: number;
  appliedAt: Date;
  lastAppliedAt?: Date;
  nextAllowedAt?: Date;
};

const toQuestionnaireKey = (questionnaireId?: string): string => {
  const normalized = questionnaireId?.trim();
  return normalized && normalized.length > 0 ? normalized : PERSONAL_BULK_COOLDOWN_KEY;
};

const readDate = (value: Date | string | undefined): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : undefined;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
};

const readCooldownAt = (
  source: CooldownMap | undefined,
  questionnaireKey: string
): Date | undefined => {
  if (!source) return undefined;
  if (source instanceof Map) {
    return readDate(source.get(questionnaireKey));
  }
  return readDate(source[questionnaireKey]);
};

export const evaluatePersonalQuestionnaireCooldown = (input: {
  questionnaireId?: string;
  vectorsMeta?: PersonalVectorsMeta;
  now?: Date;
  cooldownDays?: number;
}): PersonalCooldownDecision => {
  const now = input.now ?? new Date();
  const cooldownDays = input.cooldownDays ?? PERSONAL_VECTOR_COOLDOWN_DAYS;
  const questionnaireKey = toQuestionnaireKey(input.questionnaireId);

  const lastAppliedAt = readCooldownAt(
    input.vectorsMeta?.personalQuestionnaireCooldowns,
    questionnaireKey
  );

  if (!lastAppliedAt) {
    return {
      applied: true,
      reason: 'APPLIED',
      questionnaireKey,
      cooldownDays,
      appliedAt: now,
    };
  }

  const nextAllowedAt = new Date(lastAppliedAt.getTime() + cooldownDays * DAY_IN_MS);
  if (now.getTime() < nextAllowedAt.getTime()) {
    return {
      applied: false,
      reason: 'COOLDOWN',
      questionnaireKey,
      cooldownDays,
      appliedAt: now,
      lastAppliedAt,
      nextAllowedAt,
    };
  }

  return {
    applied: true,
    reason: 'APPLIED',
    questionnaireKey,
    cooldownDays,
    appliedAt: now,
    lastAppliedAt,
    nextAllowedAt,
  };
};
