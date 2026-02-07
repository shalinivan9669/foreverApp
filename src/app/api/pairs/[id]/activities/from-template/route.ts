// src/app/api/pairs/[id]/activities/from-template/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { ActivityTemplate, type ActivityTemplateType } from '@/models/ActivityTemplate';
import { PairActivity } from '@/models/PairActivity';
import { requireSession } from '@/lib/auth/guards';

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const { templateId } = (await req.json()) as { templateId?: string };
  if (!templateId) return NextResponse.json({ error: 'missing templateId' }, { status: 400 });

  await connectToDatabase();

  const pair = await Pair.findById(id).lean();
  if (!pair) return NextResponse.json({ error: 'pair not found' }, { status: 404 });

  const tpl = await ActivityTemplate.findById(templateId).lean<ActivityTemplateType | null>();
  if (!tpl) return NextResponse.json({ error: 'template not found' }, { status: 404 });

  const users = await User.find({ id: { $in: pair.members } }).lean<(UserType & { _id: Types.ObjectId })[]>();
  if (users.length !== 2) return NextResponse.json({ error: 'users missing' }, { status: 400 });

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

  return NextResponse.json({ ok: true, id: String(act._id) });
}
