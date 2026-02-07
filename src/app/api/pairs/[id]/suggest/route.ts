import { NextRequest } from 'next/server';
import { User, UserType } from '@/models/User';
import { ActivityTemplate } from '@/models/ActivityTemplate';
import { PairActivity } from '@/models/PairActivity';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams } from '@/lib/api/validate';

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;
  const pair = pairGuard.data.pair;

  if (!pair.passport?.riskZones?.length) {
    return jsonError(400, 'PAIR_PASSPORT_RISK_MISSING', 'no passport');
  }

  const fatigue = pair.fatigue?.score ?? 0;
  // самая актуальная зона риска
  const rz = pair.passport.riskZones.slice().sort((a,b)=>b.severity-a.severity)[0];
  const difficulty = Math.min(5, Math.max(1, rz.severity + (fatigue>0.6?-1:0) + (fatigue<0.3?1:0)));

  // Dedup: avoid offering the same template twice in a row
  const lastOffered = await PairActivity.findOne({ pairId: pair._id, status: 'offered' })
    .sort({ createdAt: -1 })
    .lean<{ stateMeta?: { templateId?: string } }>();
  const lastTplId = lastOffered?.stateMeta?.templateId;

  const tplCandidates = await ActivityTemplate.aggregate([
    { $match: { axis: rz.axis, difficulty: { $in: [difficulty, Math.max(1,difficulty-1), Math.min(5,difficulty+1)] } } },
    { $sample: { size: 5 } }
  ]);
  const docs = tplCandidates
    .filter((t: { _id: string }) => t._id !== lastTplId)
    .slice(0, 3);

  // инстанс «offered» на основе шаблонов
  const users = await User.find({ id: { $in: pair.members } }).lean<UserType[] & { _id: Types.ObjectId }[]>();
  const now = new Date();
  const created = await Promise.all(docs.map(tpl => PairActivity.create({
    pairId: pair._id,
    members: [users[0]._id as unknown as Types.ObjectId, users[1]._id as unknown as Types.ObjectId],
    intent: tpl.intent,
    archetype: tpl.archetype,
    axis: tpl.axis,
    facetsTarget: tpl.facetsTarget,
    title: tpl.title,
    description: tpl.description,
    why: { ru:`Работа с риском по оси ${rz.axis}`, en:`Work on ${rz.axis} risk` },
    mode: 'together',
    sync: 'sync',
    difficulty: tpl.difficulty,
    intensity: tpl.intensity,
    timeEstimateMin: tpl.timeEstimateMin,
    costEstimate: tpl.costEstimate,
    location: tpl.location,
    materials: tpl.materials,
    offeredAt: now,
    dueAt: new Date(now.getTime() + 3*24*3600*1000),
    requiresConsent: tpl.requiresConsent,
    status: 'offered',
    stateMeta: { templateId: (tpl as { _id: string })._id },
    checkIns: tpl.checkIns,
    effect: tpl.effect,
    fatigueDeltaOnComplete: tpl.intent==='improve' ? 0.08 : -0.05,
    readinessDeltaOnComplete: tpl.intent==='improve' ? 0.02 : 0.05,
    createdBy: 'system',
  })));

  return jsonOk(
    created.map((x) => ({ id: String(x._id), title: x.title, difficulty: x.difficulty }))
  );
}
