import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, UserType } from '@/models/User';
import {
  ActivityTemplate,
  ActivityTemplateType,
  Axis
} from '@/models/ActivityTemplate';
import { PairActivity } from '@/models/PairActivity';

export async function POST(req: NextRequest) {
  const { userId } = (await req.json()) as { userId: string };
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 });

  await connectToDatabase();

  // 1) найдём активную пару пользователя
  const pair = await Pair.findOne({ members: userId, status: 'active' }).lean();
  if (!pair) return NextResponse.json({ error: 'no active pair' }, { status: 404 });

  if (!pair.passport || !pair.passport.riskZones?.length) {
    return NextResponse.json({ error: 'no passport or risks' }, { status: 400 });
  }

  // 2) берём самую "тяжёлую" ось риска
  const risk = pair.passport.riskZones.slice().sort((a,b) => b.severity - a.severity)[0];
  const axis = risk.axis as Axis;
  const difficulty = Math.min(5, Math.max(1, risk.severity as number)); // 1..5

  // 3) подберём шаблон (по оси и примерной сложности)
  const docs = await ActivityTemplate.aggregate<ActivityTemplateType>([
    { $match: { axis, difficulty } },
    { $sample: { size: 1 } },
  ]);
  const tpl = docs[0] || (await ActivityTemplate.findOne({ axis }).sort({ difficulty: -1 }).lean());
  if (!tpl) return NextResponse.json({ error: 'no templates for axis' }, { status: 404 });

  // 4) найдём _id участников
  const users = await User.find({ id: { $in: pair.members } })
    .lean<(UserType & { _id: Types.ObjectId })[]>();
  if (users.length !== 2) return NextResponse.json({ error: 'users missing' }, { status: 400 });
  const uA = users.find(u => u.id === pair.members[0])!;
  const uB = users.find(u => u.id === pair.members[1])!;

  // 5) создаём инстанс активности
  const now = new Date();
  const dueAt = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  const act = await PairActivity.create({
    pairId: (pair as any)._id,
    members: [uA._id, uB._id],

    intent: tpl.intent,
    archetype: tpl.archetype,
    axis: tpl.axis,
    facetsTarget: tpl.facetsTarget ?? [],

    title: tpl.title,
    description: tpl.description,
    why: { ru: `Работаем с риском по оси: ${axis}`, en: `Addressing risk on axis: ${axis}` },

    mode: 'together',
    sync: 'sync',
    difficulty: tpl.difficulty,
    intensity: tpl.intensity,

    timeEstimateMin: tpl.timeEstimateMin,
    costEstimate: tpl.costEstimate,
    location: tpl.location ?? 'any',
    materials: tpl.materials ?? [],

    offeredAt: now,
    dueAt,
    cooldownDays: tpl.cooldownDays,

    requiresConsent: tpl.requiresConsent,
    status: 'offered',

    checkIns: tpl.checkIns,
    effect: tpl.effect,

    fatigueDeltaOnComplete: 0.05,
    readinessDeltaOnComplete: 0.05,

    createdBy: 'system',
  });

  // опционально: указать текущую активность в паре (для «тайла» в меню)
  await Pair.updateOne(
    { _id: (pair as any)._id },
    { $set: { activeActivity: { type: 'challenge', id: String(act._id), step: 0, pct: 0 } } }
  );

  return NextResponse.json({ ok: true, activityId: String(act._id) });
}
