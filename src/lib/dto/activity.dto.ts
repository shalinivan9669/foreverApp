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

export type ToPairActivityDtoOptions = {
  includeLegacyId?: boolean;
  includeAnswers?: boolean;
};

export function toPairActivityDTO(
  activity: PairActivitySource,
  opts: ToPairActivityDtoOptions = {}
): PairActivityDTO {
  const includeLegacyId = opts.includeLegacyId ?? false;
  const includeAnswers = opts.includeAnswers ?? false;

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

