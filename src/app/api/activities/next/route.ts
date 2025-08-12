// src/app/api/activities/next/route.ts
import { NextRequest, NextResponse } from 'next/server';
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

type LeanUser = UserType & { _id: Types.ObjectId };

export async function POST(req: NextRequest) {
  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) {
    return NextResponse.json({ error: 'missing userId' }, { status: 400 });
  }

  await connectToDatabase();

  // Ищем активную пару пользователя
  const pair = await Pair.findOne({
    members: userId,
    status: 'active',
  }).lean();

  if (!pair) {
    return NextResponse.json({ error: 'no active pair' }, { status: 404 });
  }

  // Определяем приоритетную ось по рискам паспорта
  const topRisk = (pair.passport?.riskZones ?? [])
    .slice()
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))[0];

  if (!topRisk) {
    return NextResponse.json({ error: 'no risks in passport' }, { status: 400 });
  }

  const axis = topRisk.axis as Axis;
  const difficulty = topRisk.severity as 1 | 2 | 3;

  // Берём подходящий шаблон активности по оси/сложности
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
    return NextResponse.json({ error: 'no templates for axis' }, { status: 404 });
  }

  // Подтягиваем ObjectId пользователей по discord-id из pair.members
  const users = await User.find({ id: { $in: pair.members } })
    .lean<LeanUser[]>()
    .exec();

  if (users.length !== 2) {
    return NextResponse.json({ error: 'users missing' }, { status: 400 });
  }

  // Приведём порядок участников ровно как в pair.members
  const [uA, uB] = pair.members.map(
    (discordId) => users.find((u) => u.id === discordId)!
  );

  const members: [Types.ObjectId, Types.ObjectId] = [uA._id, uB._id];

  // Окно выполнения и дедлайн
  const offeredAt = new Date();
  const dueAt = new Date(offeredAt.getTime() + 3 * 24 * 60 * 60 * 1000);

  // Создаём экземпляр активности для пары
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
    // состояние
    status: 'offered',
    checkIns: tpl.checkIns,
    effect: tpl.effect,
    createdBy: 'system',
  });

  return NextResponse.json({
    ok: true,
    activityId: String(act._id),
  });
}
