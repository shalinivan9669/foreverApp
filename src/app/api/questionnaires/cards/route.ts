import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Questionnaire } from '@/models/Questionnaire';
import { Pair } from '@/models/Pair';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { verifyJwt } from '@/lib/jwt';

type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

type Audience = 'pair' | 'solo' | 'universal';
type Status = 'new' | 'in_progress' | 'completed' | 'required' | 'locked';
type Cta = 'start' | 'continue' | 'result' | 'locked';

type CardDTO = {
  id: string;
  vector: Axis;
  audience: Audience;
  title: string;
  subtitle: string;
  tagsPublic: string[];
  tagsHiddenCount: number;
  questionCount: number;
  estMinutesMin: number;
  estMinutesMax: number;
  level: 1 | 2 | 3 | 4 | 5;
  rewardCoins?: number;
  insightsCount?: number;
  status: Status;
  progressPct?: number;
  lockReason?: string;
  cta: Cta;
  isStarter?: boolean;
};

type QDoc = {
  _id: string;
  title?: Record<string, string>;
  description?: Record<string, string>;
  axis: Axis;
  target?: { type?: 'individual' | 'couple'; gender?: 'unisex' | 'male' | 'female' };
  difficulty?: number;
  tags?: string[];
  meta?: { isStarter?: boolean };
  questionCount: number;
};

type Session = { _id: Types.ObjectId; questionnaireId: string; status: 'in_progress' | 'completed' };
type InProgressSession = Session & { status: 'in_progress' };
type CompletedSession = Session & { status: 'completed' };

const SYSTEM_TAGS = new Set(['baseline', 'multi-axis', 'starter']);

const axisLabel: Record<Axis, string> = {
  communication: 'коммуникацию',
  domestic: 'быт',
  personalViews: 'взгляды',
  finance: 'финансы',
  sexuality: 'интим',
  psyche: 'психику',
};

const toTitle = (q: QDoc) => q.title?.ru ?? q.title?.en ?? q._id;
const toSubtitle = (q: QDoc) =>
  q.description?.ru ?? q.description?.en ?? `Прокачает ${axisLabel[q.axis]}`;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const estimateMinutes = (count: number) => {
  if (count <= 6) return { min: 2, max: 3 };
  if (count <= 10) return { min: 3, max: 5 };
  if (count <= 15) return { min: 5, max: 7 };
  if (count <= 20) return { min: 6, max: 9 };
  return { min: 8, max: 12 };
};

const calcLevel = (difficulty: number | undefined, count: number): 1 | 2 | 3 | 4 | 5 => {
  const base = typeof difficulty === 'number' ? difficulty : 1;
  const bump = count >= 16 ? 2 : count >= 10 ? 1 : 0;
  return clamp(base + bump, 1, 5) as 1 | 2 | 3 | 4 | 5;
};

const audienceFrom = (q: QDoc): Audience => {
  const t = q.target?.type;
  const g = q.target?.gender;
  if (t === 'couple') return 'pair';
  if (g === 'unisex' || !g) return 'universal';
  return 'solo';
};

const isInProgress = (s: Session): s is InProgressSession => s.status === 'in_progress';
const isCompleted = (s: Session): s is CompletedSession => s.status === 'completed';

const getSessionUserId = (req: NextRequest): string | null => {
  const token = req.cookies.get('session')?.value;
  if (!token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const payload = verifyJwt(token, secret);
  return payload?.sub ?? null;
};

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await connectToDatabase();

  const pair = await Pair.findOne({ members: userId, status: 'active' }).lean<{ _id: Types.ObjectId; members: [string, string] } | null>();
  const pairId = pair?._id ?? null;

  const questions = await Questionnaire.aggregate<QDoc>([
    {
      $project: {
        title: 1,
        description: 1,
        axis: 1,
        target: 1,
        difficulty: 1,
        tags: 1,
        meta: 1,
        questionCount: { $size: { $ifNull: ['$questions', []] } },
      },
    },
  ]);

  const sessionsByQid = new Map<string, { inProgress?: InProgressSession; completed?: CompletedSession }>();
  if (pairId) {
    const sessions = await PairQuestionnaireSession.find({
      pairId: new Types.ObjectId(pairId),
      status: { $in: ['in_progress', 'completed'] },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean<Session[]>();

    for (const s of sessions) {
      const entry = sessionsByQid.get(s.questionnaireId) ?? {};
      if (isInProgress(s) && !entry.inProgress) entry.inProgress = s;
      if (isCompleted(s) && !entry.completed) entry.completed = s;
      sessionsByQid.set(s.questionnaireId, entry);
    }
  }

  const by = pair ? (pair.members[0] === userId ? 'A' : 'B') : null;
  const sessionIds = Array.from(sessionsByQid.values())
    .map((s) => s.inProgress?._id ?? s.completed?._id)
    .filter((v): v is Types.ObjectId => Boolean(v));

  const answeredBySession = new Map<string, number>();
  if (sessionIds.length && by) {
    const answered = await PairQuestionnaireAnswer.aggregate<{ _id: Types.ObjectId; answeredCount: number }>([
      { $match: { sessionId: { $in: sessionIds }, by } },
      { $group: { _id: { sessionId: '$sessionId', questionId: '$questionId' } } },
      { $group: { _id: '$_id.sessionId', answeredCount: { $sum: 1 } } },
    ]);
    for (const a of answered) {
      answeredBySession.set(String(a._id), a.answeredCount);
    }
  }

  const cards: CardDTO[] = questions.map((q) => {
    const qid = String(q._id);
    const session = sessionsByQid.get(qid);
    const active = session?.inProgress;
    const completed = session?.completed;

    const isPairOnly = q.target?.type === 'couple';
    const locked = isPairOnly && !pairId;
    const isStarter = Boolean(q.meta?.isStarter);

    let status: Status = 'new';
    if (locked) status = 'locked';
    else if (active) status = 'in_progress';
    else if (completed) status = 'completed';
    else if (isStarter) status = 'required';

    const qCount = q.questionCount ?? 0;
    const estimate = estimateMinutes(qCount);
    const level = calcLevel(q.difficulty, qCount);

    const filteredTags = (q.tags ?? []).filter((t) => !SYSTEM_TAGS.has(t));
    const tagsPublic = filteredTags.slice(0, 2);
    const tagsHiddenCount = Math.max(0, filteredTags.length - tagsPublic.length);

    const usedSession = active ?? completed;
    const answered = usedSession ? answeredBySession.get(String(usedSession._id)) ?? 0 : 0;
    const progressPct = qCount > 0 ? Math.round((answered / qCount) * 100) : 0;

    const cta: Cta =
      status === 'locked' ? 'locked' :
      status === 'completed' ? 'result' :
      status === 'in_progress' ? 'continue' :
      'start';

    return {
      id: qid,
      vector: q.axis,
      audience: audienceFrom(q),
      title: toTitle(q),
      subtitle: toSubtitle(q),
      tagsPublic,
      tagsHiddenCount,
      questionCount: qCount,
      estMinutesMin: estimate.min,
      estMinutesMax: estimate.max,
      level,
      status,
      progressPct: status === 'in_progress' || status === 'completed' ? progressPct : undefined,
      lockReason: locked ? 'нужна пара' : undefined,
      cta,
      isStarter,
      pairId: pairId ? String(pairId) : null,
    };
  });

  return NextResponse.json(cards);
}
