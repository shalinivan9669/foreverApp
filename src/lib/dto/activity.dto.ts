import type { ActivityTemplateType, Axis, CheckInTpl, EffectTpl } from '@/models/ActivityTemplate';
import type { PairActivityType } from '@/models/PairActivity';

type IdLike = string | { toString(): string };
type DateLike = Date | string | undefined | null;

const toId = (value: IdLike | undefined): string => (value ? String(value) : '');
const toIso = (value: DateLike): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
};

type PairActivitySource = PairActivityType & {
  _id?: IdLike;
  pairId: PairActivityType['pairId'] | IdLike;
};

type ActivityTemplateSource = ActivityTemplateType;

export type PairActivityDTO = {
  id: string;
  _id?: string;
  pairId: string;
  intent: PairActivityType['intent'];
  archetype: PairActivityType['archetype'];
  axis: Axis[];
  facetsTarget?: string[];
  title: { ru: string; en: string };
  description?: { ru: string; en: string };
  why: { ru: string; en: string };
  mode: PairActivityType['mode'];
  sync: PairActivityType['sync'];
  difficulty: PairActivityType['difficulty'];
  intensity: PairActivityType['intensity'];
  timeEstimateMin?: number;
  costEstimate?: number;
  location?: PairActivityType['location'];
  materials?: string[];
  offeredAt?: string;
  acceptedAt?: string;
  windowStart?: string;
  windowEnd?: string;
  dueAt?: string;
  recurrence?: string;
  cooldownDays?: number;
  requiresConsent?: boolean;
  consentA?: PairActivityType['consentA'];
  consentB?: PairActivityType['consentB'];
  visibility?: PairActivityType['visibility'];
  status: PairActivityType['status'];
  checkIns: CheckInTpl[];
  answers?: {
    checkInId: string;
    by: 'A' | 'B';
    ui: number;
    at: string;
  }[];
  successScore?: number;
  effect?: EffectTpl[];
  fatigueDeltaOnComplete?: number;
  readinessDeltaOnComplete?: number;
  createdBy: PairActivityType['createdBy'];
  legacy?: boolean;
  legacySource?: 'relationship_activity';
  createdAt?: string;
  updatedAt?: string;
};

export type ActivityTemplateDTO = {
  id: string;
  intent: ActivityTemplateType['intent'];
  archetype: ActivityTemplateType['archetype'];
  axis: Axis[];
  facetsTarget?: string[];
  difficulty: ActivityTemplateType['difficulty'];
  intensity: ActivityTemplateType['intensity'];
  timeEstimateMin?: number;
  costEstimate?: number;
  location?: ActivityTemplateType['location'];
  requiresConsent?: boolean;
  title: Record<string, string>;
  description: Record<string, string>;
  steps?: { ru: string[]; en: string[] };
  materials?: string[];
  checkIns: CheckInTpl[];
  effect: EffectTpl[];
  cooldownDays?: number;
};

export type ActivityOfferDTO = {
  id: string;
  templateId?: string;
  title: { ru: string; en: string };
  axis: Axis[];
  difficulty: PairActivityType['difficulty'];
  stepsPreview?: { ru: string[]; en: string[] };
  reward: {
    readinessDelta: number;
    fatigueDelta: number;
  };
  expiresAt?: string;
  source: string;
};

export type ToPairActivityDtoOptions = {
  includeLegacyId?: boolean;
  includeAnswers?: boolean;
  legacy?: boolean;
};

export function toPairActivityDTO(
  activity: PairActivitySource,
  opts: ToPairActivityDtoOptions = {}
): PairActivityDTO {
  const includeLegacyId = opts.includeLegacyId ?? false;
  const includeAnswers = opts.includeAnswers ?? false;
  const legacy = opts.legacy ?? false;

  const id = toId(activity._id);
  const dto: PairActivityDTO = {
    id,
    pairId: toId(activity.pairId as IdLike),
    intent: activity.intent,
    archetype: activity.archetype,
    axis: activity.axis,
    facetsTarget: activity.facetsTarget,
    title: activity.title,
    description: activity.description,
    why: activity.why,
    mode: activity.mode,
    sync: activity.sync,
    difficulty: activity.difficulty,
    intensity: activity.intensity,
    timeEstimateMin: activity.timeEstimateMin,
    costEstimate: activity.costEstimate,
    location: activity.location,
    materials: activity.materials,
    offeredAt: toIso(activity.offeredAt),
    acceptedAt: toIso(activity.acceptedAt),
    windowStart: toIso(activity.windowStart),
    windowEnd: toIso(activity.windowEnd),
    dueAt: toIso(activity.dueAt),
    recurrence: activity.recurrence,
    cooldownDays: activity.cooldownDays,
    requiresConsent: activity.requiresConsent,
    consentA: activity.consentA,
    consentB: activity.consentB,
    visibility: activity.visibility,
    status: activity.status,
    checkIns: activity.checkIns,
    successScore: activity.successScore,
    effect: activity.effect,
    fatigueDeltaOnComplete: activity.fatigueDeltaOnComplete,
    readinessDeltaOnComplete: activity.readinessDeltaOnComplete,
    createdBy: activity.createdBy,
    createdAt: toIso(activity.createdAt),
    updatedAt: toIso(activity.updatedAt),
  };

  if (includeLegacyId) dto._id = id;
  if (legacy) {
    dto.legacy = true;
    dto.legacySource = 'relationship_activity';
  }

  if (includeAnswers) {
    dto.answers = (activity.answers ?? []).map((answer) => ({
      checkInId: answer.checkInId,
      by: answer.by,
      ui: answer.ui,
      at: toIso(answer.at) ?? '',
    }));
  }

  return dto;
}

export function toActivityTemplateDTO(template: ActivityTemplateSource): ActivityTemplateDTO {
  return {
    id: template._id,
    intent: template.intent,
    archetype: template.archetype,
    axis: template.axis,
    facetsTarget: template.facetsTarget,
    difficulty: template.difficulty,
    intensity: template.intensity,
    timeEstimateMin: template.timeEstimateMin,
    costEstimate: template.costEstimate,
    location: template.location,
    requiresConsent: template.requiresConsent,
    title: template.title,
    description: template.description,
    steps: template.steps,
    materials: template.materials,
    checkIns: template.checkIns,
    effect: template.effect,
    cooldownDays: template.cooldownDays,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const toStepsPreview = (value: unknown): { ru: string[]; en: string[] } | undefined => {
  if (!isRecord(value)) return undefined;
  const ru = toStringArray(value.ru);
  const en = toStringArray(value.en);
  if (ru.length === 0 && en.length === 0) return undefined;
  return { ru, en };
};

type OfferMeta = {
  templateId?: string;
  source?: string;
  stepsPreview?: { ru: string[]; en: string[] };
};

const extractOfferMeta = (stateMeta: unknown): OfferMeta => {
  if (!isRecord(stateMeta)) return {};
  return {
    templateId: toOptionalString(stateMeta.templateId),
    source: toOptionalString(stateMeta.source),
    stepsPreview: toStepsPreview(stateMeta.stepsPreview),
  };
};

export function toActivityOfferDTO(activity: PairActivitySource): ActivityOfferDTO {
  const id = toId(activity._id);
  const meta = extractOfferMeta(activity.stateMeta);

  return {
    id,
    templateId: meta.templateId,
    title: activity.title,
    axis: activity.axis,
    difficulty: activity.difficulty,
    stepsPreview: meta.stepsPreview,
    reward: {
      readinessDelta: activity.readinessDeltaOnComplete ?? 0,
      fatigueDelta: activity.fatigueDeltaOnComplete ?? 0,
    },
    expiresAt: toIso(activity.dueAt),
    source: meta.source ?? 'system',
  };
}

export type LegacyRelationshipActivitySource = {
  _id?: IdLike;
  pairId: string;
  type: 'task' | 'reminder' | 'challenge';
  status: 'pending' | 'completed';
  payload: {
    title: string;
    description?: string;
    dueAt?: Date | string;
  };
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

const LEGACY_ARCHETYPE_BY_TYPE: Record<
  LegacyRelationshipActivitySource['type'],
  PairActivityType['archetype']
> = {
  task: 'task',
  reminder: 'ritual',
  challenge: 'game',
};

const LEGACY_STATUS_BY_STATUS: Record<
  LegacyRelationshipActivitySource['status'],
  PairActivityType['status']
> = {
  pending: 'offered',
  completed: 'completed_partial',
};

export function toLegacyRelationshipActivityDTO(
  activity: LegacyRelationshipActivitySource
): PairActivityDTO {
  const id = toId(activity._id);
  const description = activity.payload.description?.trim();
  const titleRu = activity.payload.title.trim();
  const titleEn = titleRu;
  const descriptionText = description && description.length > 0 ? description : undefined;

  return {
    id,
    _id: id,
    pairId: activity.pairId,
    intent: 'improve',
    archetype: LEGACY_ARCHETYPE_BY_TYPE[activity.type],
    axis: ['communication'],
    facetsTarget: [],
    title: { ru: titleRu, en: titleEn },
    description: descriptionText
      ? { ru: descriptionText, en: descriptionText }
      : undefined,
    why: {
      ru: 'Legacy RelationshipActivity (read-only)',
      en: 'Legacy RelationshipActivity (read-only)',
    },
    mode: 'together',
    sync: 'async',
    difficulty: 1,
    intensity: 1,
    location: 'any',
    materials: [],
    offeredAt: toIso(activity.createdAt),
    dueAt: toIso(activity.payload.dueAt),
    status: LEGACY_STATUS_BY_STATUS[activity.status],
    checkIns: [],
    createdBy: 'system',
    legacy: true,
    legacySource: 'relationship_activity',
    createdAt: toIso(activity.createdAt),
    updatedAt: toIso(activity.updatedAt),
  };
}
