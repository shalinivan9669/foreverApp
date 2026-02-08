import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import {
  ActivityTemplate,
  type ActivityTemplateType,
  type Axis,
} from '@/models/ActivityTemplate';
import { PairActivity } from '@/models/PairActivity';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import {
  toActivityOfferDTO,
  type ActivityOfferDTO,
} from '@/lib/dto';

type GuardErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

type OfferSource = 'pairs.suggest' | 'pairs.activities.suggest' | 'activities.next';

const guardFailureToDomainError = async (response: Response): Promise<DomainError> => {
  const payload = await response
    .clone()
    .json()
    .catch(() => null) as GuardErrorPayload | null;

  return new DomainError({
    code: payload?.error?.code ?? 'INTERNAL',
    status: response.status || 500,
    message: payload?.error?.message ?? 'Request failed',
  });
};

const ensurePairMember = async (pairId: string, currentUserId: string) => {
  const pairGuard = await requirePairMember(pairId, currentUserId);
  if (!pairGuard.ok) {
    throw await guardFailureToDomainError(pairGuard.response);
  }
  return pairGuard.data;
};

type LeanUser = UserType & { _id: Types.ObjectId };

const resolveMembers = async (
  members: [string, string]
): Promise<[Types.ObjectId, Types.ObjectId]> => {
  const users = await User.find({ id: { $in: members } })
    .lean<LeanUser[]>()
    .exec();

  if (users.length !== 2) {
    throw new DomainError({
      code: 'PAIR_MEMBERS_MISSING',
      status: 400,
      message: 'Pair members are missing',
    });
  }

  const first = users.find((user) => user.id === members[0]);
  const second = users.find((user) => user.id === members[1]);
  if (!first || !second) {
    throw new DomainError({
      code: 'PAIR_MEMBERS_MISSING',
      status: 400,
      message: 'Pair members are missing',
    });
  }

  return [first._id, second._id];
};

type TemplateExtra = {
  fatigueDeltaOnComplete?: number;
  readinessDeltaOnComplete?: number;
};

type RiskItem = { axis: Axis; severity: 1 | 2 | 3 };

type PairRiskSource = {
  passport?: {
    riskZones?: { axis: string; severity: number; facets?: string[] }[];
  };
};

const resolveTopRisk = (pair: PairRiskSource): RiskItem => {
  const risks = (pair.passport?.riskZones ?? []) as RiskItem[];
  const topRisk = risks
    .slice()
    .sort((left, right) => right.severity - left.severity)[0];

  if (!topRisk) {
    throw new DomainError({
      code: 'PAIR_PASSPORT_RISK_MISSING',
      status: 400,
      message: 'No passport risk zones',
    });
  }

  return topRisk;
};

const autoDeltas = (
  intent: 'improve' | 'celebrate',
  intensity: 1 | 2 | 3
): { fatigueDeltaOnComplete: number; readinessDeltaOnComplete: number } => {
  if (intent === 'celebrate') {
    return {
      fatigueDeltaOnComplete: -0.08 * intensity,
      readinessDeltaOnComplete: +0.1 * intensity,
    };
  }
  return {
    fatigueDeltaOnComplete: +0.06 * intensity,
    readinessDeltaOnComplete: +0.04 * intensity,
  };
};

const resolveDifficulty = (input: {
  topRiskSeverity: number;
  fatigueScore: number;
}): 1 | 2 | 3 | 4 | 5 => {
  const raw =
    input.topRiskSeverity +
    (input.fatigueScore > 0.6 ? -1 : 0) +
    (input.fatigueScore < 0.3 ? 1 : 0);
  return Math.min(5, Math.max(1, raw)) as 1 | 2 | 3 | 4 | 5;
};

const clampOfferCount = (count: number | undefined): number => {
  const raw = count ?? 3;
  return Math.min(5, Math.max(1, raw));
};

const buildStepsPreview = (
  template: ActivityTemplateType
): { ru: string[]; en: string[] } | undefined => {
  const ru = template.steps?.ru?.slice(0, 2) ?? [];
  const en = template.steps?.en?.slice(0, 2) ?? [];
  if (ru.length === 0 && en.length === 0) {
    return undefined;
  }
  return { ru, en };
};

const sourceRoute = (source: OfferSource): string => {
  if (source === 'pairs.suggest') return '/api/pairs/[id]/suggest';
  if (source === 'pairs.activities.suggest') return '/api/pairs/[id]/activities/suggest';
  return '/api/activities/next';
};

const defaultAuditRequest = (source: OfferSource): AuditRequestContext => ({
  route: sourceRoute(source),
  method: 'POST',
});

const emitSuggestionsGenerated = async (input: {
  pairId: string;
  currentUserId: string;
  count: number;
  source: OfferSource;
  auditRequest?: AuditRequestContext;
}): Promise<void> => {
  await emitEvent({
    event: 'SUGGESTIONS_GENERATED',
    actor: { userId: input.currentUserId },
    request: input.auditRequest ?? defaultAuditRequest(input.source),
    context: { pairId: input.pairId },
    target: {
      type: 'pair',
      id: input.pairId,
    },
    metadata: {
      pairId: input.pairId,
      count: input.count,
      source: input.source,
    },
  });
};

const loadCandidateTemplates = async (input: {
  axis: Axis;
  difficulty: number;
  dedupeTemplateId?: string;
  count: number;
}): Promise<ActivityTemplateType[]> => {
  const difficulties = [
    input.difficulty,
    Math.max(1, input.difficulty - 1),
    Math.min(5, input.difficulty + 1),
  ];

  const sampled = await ActivityTemplate.aggregate<ActivityTemplateType>([
    {
      $match: {
        axis: input.axis,
        difficulty: { $in: difficulties },
      },
    },
    { $sample: { size: Math.max(6, input.count + 3) } },
  ]);

  const byId = new Map<string, ActivityTemplateType>();

  for (const template of sampled) {
    const templateId = String(template._id);
    if (input.dedupeTemplateId && templateId === input.dedupeTemplateId) {
      continue;
    }
    if (!byId.has(templateId)) {
      byId.set(templateId, template);
    }
  }

  if (byId.size < input.count) {
    const fallback = await ActivityTemplate.find({
      axis: input.axis,
      difficulty: { $in: difficulties },
    })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean<ActivityTemplateType[]>();

    for (const template of fallback) {
      const templateId = String(template._id);
      if (input.dedupeTemplateId && templateId === input.dedupeTemplateId) {
        continue;
      }
      if (!byId.has(templateId)) {
        byId.set(templateId, template);
      }
      if (byId.size >= input.count) break;
    }
  }

  return Array.from(byId.values()).slice(0, input.count);
};

type SuggestActivitiesInput = {
  pairId: string;
  currentUserId: string;
  dedupeAgainstLastOffered: boolean;
  count?: number;
  source: OfferSource;
  auditRequest?: AuditRequestContext;
};

const suggestActivitiesInternal = async (
  input: SuggestActivitiesInput
): Promise<ActivityOfferDTO[]> => {
  const pairData = await ensurePairMember(input.pairId, input.currentUserId);
  const pair = pairData.pair;
  const topRisk = resolveTopRisk(pair);
  const fatigue = pair.fatigue?.score ?? 0;
  const difficulty = resolveDifficulty({
    topRiskSeverity: topRisk.severity,
    fatigueScore: fatigue,
  });

  let lastTemplateId: string | undefined;
  if (input.dedupeAgainstLastOffered) {
    const lastOffered = await PairActivity.findOne({
      pairId: pair._id,
      status: 'offered',
    })
      .sort({ createdAt: -1 })
      .lean<{ stateMeta?: Record<string, unknown> } | null>();

    const templateId = lastOffered?.stateMeta?.templateId;
    if (typeof templateId === 'string' && templateId.trim().length > 0) {
      lastTemplateId = templateId;
    }
  }

  const targetCount = clampOfferCount(input.count);
  const templates = await loadCandidateTemplates({
    axis: topRisk.axis,
    difficulty,
    dedupeTemplateId: lastTemplateId,
    count: targetCount,
  });

  if (!templates.length) {
    await emitSuggestionsGenerated({
      pairId: String(pair._id),
      currentUserId: input.currentUserId,
      count: 0,
      source: input.source,
      auditRequest: input.auditRequest,
    });
    return [];
  }

  const members = await resolveMembers(pair.members as [string, string]);
  const now = new Date();
  const dueAt = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  const created = await Promise.all(
    templates.map((template) => {
      const extra = template as unknown as TemplateExtra;
      const fallback = autoDeltas(template.intent, template.intensity);
      const stepsPreview = buildStepsPreview(template);

      return PairActivity.create({
        pairId: pair._id,
        members,
        intent: template.intent,
        archetype: template.archetype,
        axis: template.axis,
        facetsTarget: template.facetsTarget ?? [],
        title: template.title,
        description: template.description,
        why: {
          ru: `Работа с риском по оси ${topRisk.axis}`,
          en: `Work on ${topRisk.axis} risk`,
        },
        mode: 'together',
        sync: 'sync',
        difficulty: template.difficulty,
        intensity: template.intensity,
        timeEstimateMin: template.timeEstimateMin,
        costEstimate: template.costEstimate,
        location: template.location ?? 'any',
        materials: template.materials ?? [],
        offeredAt: now,
        dueAt,
        requiresConsent: template.requiresConsent,
        status: 'offered',
        stateMeta: {
          templateId: String(template._id),
          source: input.source,
          stepsPreview,
        },
        checkIns: template.checkIns,
        effect: template.effect,
        fatigueDeltaOnComplete:
          extra.fatigueDeltaOnComplete ?? fallback.fatigueDeltaOnComplete,
        readinessDeltaOnComplete:
          extra.readinessDeltaOnComplete ?? fallback.readinessDeltaOnComplete,
        createdBy: 'system',
      });
    })
  );

  await emitSuggestionsGenerated({
    pairId: String(pair._id),
    currentUserId: input.currentUserId,
    count: created.length,
    source: input.source,
    auditRequest: input.auditRequest,
  });

  return created.map((activity) => toActivityOfferDTO(activity.toObject()));
};

export const activityOfferService = {
  async createNextActivity(input: {
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<{ activityId: string; offer?: ActivityOfferDTO }> {
    await connectToDatabase();

    const pair = await Pair.findOne({
      members: input.currentUserId,
      status: 'active',
    }).lean<{ _id: Types.ObjectId } | null>();

    if (!pair) {
      throw new DomainError({
        code: 'PAIR_NOT_FOUND',
        status: 404,
        message: 'No active pair',
      });
    }

    const offers = await suggestActivitiesInternal({
      pairId: String(pair._id),
      currentUserId: input.currentUserId,
      dedupeAgainstLastOffered: true,
      count: 1,
      source: 'activities.next',
      auditRequest: input.auditRequest,
    });

    const first = offers[0];
    if (!first) {
      throw new DomainError({
        code: 'ACTIVITY_TEMPLATE_NOT_FOUND',
        status: 404,
        message: 'No templates for axis',
      });
    }

    return {
      activityId: first.id,
      offer: first,
    };
  },

  async suggestActivities(input: SuggestActivitiesInput): Promise<ActivityOfferDTO[]> {
    return suggestActivitiesInternal(input);
  },

  async createFromTemplate(input: {
    pairId: string;
    templateId: string;
    currentUserId: string;
  }): Promise<{ id: string; offer?: ActivityOfferDTO }> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pair = pairData.pair;

    const template = await ActivityTemplate.findById(input.templateId)
      .lean<ActivityTemplateType | null>();
    if (!template) {
      throw new DomainError({
        code: 'ACTIVITY_TEMPLATE_NOT_FOUND',
        status: 404,
        message: 'Template not found',
      });
    }

    const members = await resolveMembers(pair.members as [string, string]);
    const now = new Date();
    const stepsPreview = buildStepsPreview(template);

    const activity = await PairActivity.create({
      pairId: new Types.ObjectId(pair._id),
      members,
      intent: template.intent,
      archetype: template.archetype,
      axis: template.axis,
      facetsTarget: template.facetsTarget ?? [],
      title: template.title,
      description: template.description,
      why: {
        ru: 'Выбрано из шаблонов',
        en: 'Chosen from templates',
      },
      mode: 'together',
      sync: 'sync',
      difficulty: template.difficulty,
      intensity: template.intensity,
      timeEstimateMin: template.timeEstimateMin,
      costEstimate: template.costEstimate,
      location: template.location ?? 'any',
      materials: template.materials ?? [],
      offeredAt: now,
      dueAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
      status: 'offered',
      stateMeta: {
        templateId: String(template._id),
        source: 'pairs.activities.suggest',
        stepsPreview,
      },
      checkIns: template.checkIns,
      effect: template.effect,
      createdBy: 'user',
    });

    return {
      id: String(activity._id),
      offer: toActivityOfferDTO(activity.toObject()),
    };
  },
};
