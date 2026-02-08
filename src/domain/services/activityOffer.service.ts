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

type GuardErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

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

const resolveMembers = async (members: [string, string]): Promise<[Types.ObjectId, Types.ObjectId]> => {
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

type RiskItem = { axis: Axis; severity: 1 | 2 | 3 };

const resolveTopRisk = (pair: {
  passport?: {
    riskZones?: { axis: string; severity: number; facets?: string[] }[];
  };
}): RiskItem => {
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

type SuggestedActivityDto = {
  id: string;
  title: { ru: string; en: string };
  difficulty: number;
};

export const activityOfferService = {
  async createNextActivity(input: {
    currentUserId: string;
  }): Promise<{ activityId: string }> {
    await connectToDatabase();

    const pair = await Pair.findOne({
      members: input.currentUserId,
      status: 'active',
    }).lean();

    if (!pair) {
      throw new DomainError({
        code: 'PAIR_NOT_FOUND',
        status: 404,
        message: 'No active pair',
      });
    }

    const topRisk = resolveTopRisk(pair);
    const axis: Axis = topRisk.axis;
    const difficulty: 1 | 2 | 3 = topRisk.severity;

    const candidates = await ActivityTemplate.aggregate<ActivityTemplateType>([
      { $match: { axis, difficulty } },
      { $sample: { size: 1 } },
    ]);

    const template =
      candidates[0] ??
      (await ActivityTemplate.findOne({ axis, difficulty })
        .sort({ updatedAt: -1 })
        .lean<ActivityTemplateType>()
        .exec());

    if (!template) {
      throw new DomainError({
        code: 'ACTIVITY_TEMPLATE_NOT_FOUND',
        status: 404,
        message: 'No templates for axis',
      });
    }

    const members = await resolveMembers(pair.members as [string, string]);
    const offeredAt = new Date();
    const dueAt = new Date(offeredAt.getTime() + 3 * 24 * 60 * 60 * 1000);
    const extra = template as unknown as TemplateExtra;
    const fallback = autoDeltas(template.intent, template.intensity);

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
        ru: 'Рекомендация по зоне риска из паспорта пары',
        en: 'Suggested by pair passport risk zone',
      },
      mode: 'together',
      sync: 'sync',
      difficulty: template.difficulty,
      intensity: template.intensity,
      timeEstimateMin: template.timeEstimateMin,
      costEstimate: template.costEstimate,
      location: template.location ?? 'any',
      materials: template.materials ?? [],
      offeredAt,
      dueAt,
      status: 'offered',
      checkIns: template.checkIns,
      effect: template.effect,
      fatigueDeltaOnComplete:
        extra.fatigueDeltaOnComplete ?? fallback.fatigueDeltaOnComplete,
      readinessDeltaOnComplete:
        extra.readinessDeltaOnComplete ?? fallback.readinessDeltaOnComplete,
      createdBy: 'system',
    });

    return { activityId: String(activity._id) };
  },

  async suggestActivities(input: {
    pairId: string;
    currentUserId: string;
    dedupeAgainstLastOffered: boolean;
  }): Promise<SuggestedActivityDto[]> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pair = pairData.pair;
    const topRisk = resolveTopRisk(pair);

    const fatigue = pair.fatigue?.score ?? 0;
    const difficulty = Math.min(
      5,
      Math.max(
        1,
        topRisk.severity +
          (fatigue > 0.6 ? -1 : 0) +
          (fatigue < 0.3 ? 1 : 0)
      )
    );

    let lastTemplateId: string | undefined;
    if (input.dedupeAgainstLastOffered) {
      const lastOffered = await PairActivity.findOne({
        pairId: pair._id,
        status: 'offered',
      })
        .sort({ createdAt: -1 })
        .lean<{ stateMeta?: { templateId?: string } } | null>();
      lastTemplateId = lastOffered?.stateMeta?.templateId;
    }

    const sampled = await ActivityTemplate.aggregate<ActivityTemplateType>([
      {
        $match: {
          axis: topRisk.axis,
          difficulty: {
            $in: [difficulty, Math.max(1, difficulty - 1), Math.min(5, difficulty + 1)],
          },
        },
      },
      { $sample: { size: input.dedupeAgainstLastOffered ? 5 : 3 } },
    ]);

    const templates = sampled
      .filter((template) => !lastTemplateId || String(template._id) !== lastTemplateId)
      .slice(0, 3);

    const members = await resolveMembers(pair.members as [string, string]);
    const now = new Date();

    const created = await Promise.all(
      templates.map((template) =>
        PairActivity.create({
          pairId: pair._id,
          members,
          intent: template.intent,
          archetype: template.archetype,
          axis: template.axis,
          facetsTarget: template.facetsTarget,
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
          location: template.location,
          materials: template.materials,
          offeredAt: now,
          dueAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
          requiresConsent: template.requiresConsent,
          status: 'offered',
          stateMeta: input.dedupeAgainstLastOffered
            ? { templateId: String(template._id) }
            : undefined,
          checkIns: template.checkIns,
          effect: template.effect,
          fatigueDeltaOnComplete: template.intent === 'improve' ? 0.08 : -0.05,
          readinessDeltaOnComplete: template.intent === 'improve' ? 0.02 : 0.05,
          createdBy: 'system',
        })
      )
    );

    return created.map((activity) => ({
      id: String(activity._id),
      title: activity.title,
      difficulty: activity.difficulty,
    }));
  },

  async createFromTemplate(input: {
    pairId: string;
    templateId: string;
    currentUserId: string;
  }): Promise<{ id: string }> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pair = pairData.pair;

    const template = await ActivityTemplate.findById(input.templateId).lean<ActivityTemplateType | null>();
    if (!template) {
      throw new DomainError({
        code: 'ACTIVITY_TEMPLATE_NOT_FOUND',
        status: 404,
        message: 'Template not found',
      });
    }

    const members = await resolveMembers(pair.members as [string, string]);
    const now = new Date();

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
      checkIns: template.checkIns,
      effect: template.effect,
      createdBy: 'user',
    });

    return { id: String(activity._id) };
  },
};
