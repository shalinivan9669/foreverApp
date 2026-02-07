// src/app/api/pairs/[id]/activities/from-template/route.ts
import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { User, type UserType } from '@/models/User';
import { ActivityTemplate, type ActivityTemplateType } from '@/models/ActivityTemplate';
import { PairActivity } from '@/models/PairActivity';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseJson, parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

const bodySchema = z
  .object({
    templateId: z.string().min(1),
  })
  .strict();

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const { templateId } = body.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;
  const pair = pairGuard.data.pair;

  const tpl = await ActivityTemplate.findById(templateId).lean<ActivityTemplateType | null>();
  if (!tpl) return jsonError(404, 'ACTIVITY_TEMPLATE_NOT_FOUND', 'template not found');

  const users = await User.find({ id: { $in: pair.members } }).lean<(UserType & { _id: Types.ObjectId })[]>();
  if (users.length !== 2) return jsonError(400, 'PAIR_MEMBERS_MISSING', 'users missing');

  const [uA, uB] = pair.members.map(did => users.find(u => u.id === did)!);
  const members: [Types.ObjectId, Types.ObjectId] = [uA._id, uB._id];

  const now = new Date();
  const act = await PairActivity.create({
    pairId: new Types.ObjectId(pair._id),
    members,
    intent: tpl.intent,
    archetype: tpl.archetype,
    axis: tpl.axis,
    facetsTarget: tpl.facetsTarget ?? [],
    title: tpl.title,
    description: tpl.description,
    why: { ru: 'Выбрано из шаблонов', en: 'Chosen from templates' },
    mode: 'together',
    sync: 'sync',
    difficulty: tpl.difficulty,
    intensity: tpl.intensity,
    timeEstimateMin: tpl.timeEstimateMin,
    costEstimate: tpl.costEstimate,
    location: tpl.location ?? 'any',
    materials: tpl.materials ?? [],
    offeredAt: now,
    dueAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
    status: 'offered',
    checkIns: tpl.checkIns,
    effect: tpl.effect,
    createdBy: 'user',
  });

  return jsonOk({ id: String(act._id) });
}
