// src/app/api/activities/next/route.ts
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import {
  ActivityTemplate,
  type ActivityTemplateType,
  type Axis,
} from '@/models/ActivityTemplate';
import { PairActivity } from '@/models/PairActivity';
import { requireSession } from '@/lib/auth/guards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';

type LeanUser = UserType & { _id: Types.ObjectId };

// подпорка для «доп. полей» в шаблоне без any
type TemplateExtra = {
  fatigueDeltaOnComplete?: number;
  readinessDeltaOnComplete?: number;
};

// авто-правило дельт, если их нет в шаблоне
function autoDeltas(intent: 'improve' | 'celebrate', intensity: 1 | 2 | 3) {
  if (intent === 'celebrate') {
    return {
      fatigueDeltaOnComplete: -0.08 * intensity,
      readinessDeltaOnComplete: +0.10 * intensity,
    };
  }
  return {
    fatigueDeltaOnComplete: +0.06 * intensity,
    readinessDeltaOnComplete: +0.04 * intensity,
  };
}

export async function POST(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();

  const pair = await Pair.findOne({
    members: userId,
    status: 'active',
  }).lean();

  if (!pair) {
    return jsonError(404, 'PAIR_NOT_FOUND', 'no active pair');
  }

  // строго типизируем элемент зоны риска
  type RiskItem = { axis: Axis; severity: 1 | 2 | 3 };
  const risks = (pair.passport?.riskZones ?? []) as unknown as RiskItem[];
  const topRisk: RiskItem | undefined = risks
    .slice()
    .sort((a, b) => b.severity - a.severity)[0];

  if (!topRisk) {
    return jsonError(400, 'PAIR_PASSPORT_RISK_MISSING', 'no risks in passport');
  }

  const axis: Axis = topRisk.axis;
  const difficulty: 1 | 2 | 3 = topRisk.severity;

  const candidates = await ActivityTemplate.aggregate<ActivityTemplateType>([
    { $match: { axis, difficulty } },
    { $sample: { size: 1 } },
  ]);

  const tpl: ActivityTemplateType | null =
    candidates[0] ??
    (await ActivityTemplate.findOne({ axis, difficulty })
      .sort({ updatedAt: -1 })
      .lean<ActivityTemplateType>()
      .exec());

  if (!tpl) {
    return jsonError(404, 'ACTIVITY_TEMPLATE_NOT_FOUND', 'no templates for axis');
  }

  const users = await User.find({ id: { $in: pair.members } })
    .lean<LeanUser[]>()
    .exec();

  if (users.length !== 2) {
    return jsonError(400, 'PAIR_MEMBERS_MISSING', 'users missing');
  }

  const [uA, uB] = pair.members.map(
    (discordId) => users.find((u) => u.id === discordId)!
  );
  const members: [Types.ObjectId, Types.ObjectId] = [uA._id, uB._id];

  const offeredAt = new Date();
  const dueAt = new Date(offeredAt.getTime() + 3 * 24 * 60 * 60 * 1000);

  // берём дельты из шаблона (если есть), иначе авто-правило
  const extra = tpl as unknown as TemplateExtra;
  const fallback = autoDeltas(tpl.intent, tpl.intensity);

  const act = await PairActivity.create({
    pairId: new Types.ObjectId(pair._id),
    members,
    intent: tpl.intent,
    archetype: tpl.archetype,
    axis: tpl.axis,
    facetsTarget: tpl.facetsTarget ?? [],
    title: tpl.title,
    description: tpl.description,
    why: {
      ru: 'Рекомендация по зоне риска из паспорта пары',
      en: 'Suggested by pair passport risk zone',
    },
    mode: 'together',
    sync: 'sync',
    difficulty: tpl.difficulty,
    intensity: tpl.intensity,
    timeEstimateMin: tpl.timeEstimateMin,
    costEstimate: tpl.costEstimate,
    location: tpl.location ?? 'any',
    materials: tpl.materials ?? [],
    offeredAt,
    dueAt,
    status: 'offered',
    checkIns: tpl.checkIns,
    effect: tpl.effect,
    fatigueDeltaOnComplete:
      extra.fatigueDeltaOnComplete ?? fallback.fatigueDeltaOnComplete,
    readinessDeltaOnComplete:
      extra.readinessDeltaOnComplete ?? fallback.readinessDeltaOnComplete,
    createdBy: 'system',
  });

  return jsonOk({ activityId: String(act._id) });
}
