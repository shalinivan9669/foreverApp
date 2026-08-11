import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  Questionnaire,
  publishedQuestionnaireFilter,
} from '@/models/Questionnaire';
import { Pair } from '@/models/Pair';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PersonalQuestionnaireSubmission } from '@/models/PersonalQuestionnaireSubmission';

type QuestionnaireAudience = 'pair' | 'solo' | 'universal';
export type QuestionnaireCardScope = 'personal' | 'couple';
type QuestionnaireCardStatus =
  | 'new'
  | 'in_progress'
  | 'completed'
  | 'required'
  | 'locked';
type QuestionnaireCardCta = 'start' | 'continue' | 'result' | 'locked';

export type QuestionnaireCardDTO = {
  id: string;
  domainKey: string;
  scope: QuestionnaireCardScope;
  audience: QuestionnaireAudience;
  title: string;
  subtitle: string;
  tagsPublic: string[];
  tagsHiddenCount: number;
  questionCount: number;
  estMinutesMin: number;
  estMinutesMax: number;
  level: 1 | 2 | 3 | 4 | 5;
  status: QuestionnaireCardStatus;
  progressPct?: number;
  lockReason?: string;
  cta: QuestionnaireCardCta;
  isStarter?: boolean;
  pairId?: string | null;
};

type QuestionnaireProjection = {
  _id: string;
  title?: Record<string, string>;
  description?: Record<string, string>;
  domainKey: string;
  target?: {
    type?: 'individual' | 'couple';
    gender?: 'unisex' | 'male' | 'female';
  };
  difficulty?: number;
  tags?: string[];
  meta?: { isStarter?: boolean };
  questionCount: number;
};

type QuestionnaireSession = {
  _id: Types.ObjectId;
  questionnaireId: string;
  status: 'in_progress' | 'completed';
};
type InProgressSession = QuestionnaireSession & { status: 'in_progress' };
type CompletedSession = QuestionnaireSession & { status: 'completed' };

const SYSTEM_TAGS = new Set(['baseline', 'starter']);

const toTitle = (questionnaire: QuestionnaireProjection): string =>
  questionnaire.title?.ru ?? questionnaire.title?.en ?? String(questionnaire._id);

const toSubtitle = (questionnaire: QuestionnaireProjection): string =>
  questionnaire.description?.ru ??
  questionnaire.description?.en ??
  'Поможет лучше понять важную тему';

const estimateMinutes = (count: number): { min: number; max: number } => {
  if (count <= 6) return { min: 2, max: 3 };
  if (count <= 10) return { min: 3, max: 5 };
  if (count <= 15) return { min: 5, max: 7 };
  if (count <= 20) return { min: 6, max: 9 };
  return { min: 8, max: 12 };
};

const levelFrom = (
  difficulty: number | undefined,
  count: number
): 1 | 2 | 3 | 4 | 5 => {
  const base = typeof difficulty === 'number' ? difficulty : 1;
  const bump = count >= 16 ? 2 : count >= 10 ? 1 : 0;
  return Math.max(1, Math.min(5, base + bump)) as 1 | 2 | 3 | 4 | 5;
};

const audienceFrom = (
  questionnaire: QuestionnaireProjection
): QuestionnaireAudience => {
  if (questionnaire.target?.type === 'couple') return 'pair';
  if (!questionnaire.target?.gender || questionnaire.target.gender === 'unisex') {
    return 'universal';
  }
  return 'solo';
};

const scopeFrom = (
  questionnaire: QuestionnaireProjection
): QuestionnaireCardScope =>
  questionnaire.target?.type === 'couple' ? 'couple' : 'personal';

const isInProgress = (
  session: QuestionnaireSession
): session is InProgressSession => session.status === 'in_progress';

const isCompleted = (
  session: QuestionnaireSession
): session is CompletedSession => session.status === 'completed';

export const questionnaireCardsService = {
  async list(input: {
    currentUserId: string;
    scope?: QuestionnaireCardScope;
  }): Promise<QuestionnaireCardDTO[]> {
    await connectToDatabase();

    const pair = await Pair.findOne({
      members: input.currentUserId,
      status: 'active',
    }).lean<{ _id: Types.ObjectId; members: [string, string] } | null>();
    const pairId = pair?._id ?? null;

    const questionnaires = await Questionnaire.aggregate<QuestionnaireProjection>([
      { $match: publishedQuestionnaireFilter() },
      {
        $project: {
          title: 1,
          description: 1,
          domainKey: 1,
          target: 1,
          difficulty: 1,
          tags: 1,
          meta: 1,
          questionCount: { $size: { $ifNull: ['$questions', []] } },
        },
      },
    ]);

    const questionnaireIds = questionnaires.map((questionnaire) =>
      String(questionnaire._id)
    );
    const personalCompletionRows = questionnaireIds.length
      ? await PersonalQuestionnaireSubmission.find({
          userId: input.currentUserId,
          questionnaireId: { $in: questionnaireIds },
        })
          .select({ questionnaireId: 1 })
          .lean<Array<{ questionnaireId: string }>>()
      : [];
    const completedPersonalIds = new Set(
      personalCompletionRows.map((row) => row.questionnaireId)
    );

    const sessionsByQuestionnaire = new Map<
      string,
      { inProgress?: InProgressSession; completed?: CompletedSession }
    >();
    if (pairId) {
      const sessions = await PairQuestionnaireSession.find({
        pairId,
        status: { $in: ['in_progress', 'completed'] },
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean<QuestionnaireSession[]>();

      for (const session of sessions) {
        const entry = sessionsByQuestionnaire.get(session.questionnaireId) ?? {};
        if (isInProgress(session) && !entry.inProgress) {
          entry.inProgress = session;
        }
        if (isCompleted(session) && !entry.completed) {
          entry.completed = session;
        }
        sessionsByQuestionnaire.set(session.questionnaireId, entry);
      }
    }

    const role = pair
      ? pair.members[0] === input.currentUserId
        ? 'A'
        : 'B'
      : null;
    const sessionIds = Array.from(sessionsByQuestionnaire.values())
      .map((session) => session.inProgress?._id ?? session.completed?._id)
      .filter((value): value is Types.ObjectId => Boolean(value));

    const answeredBySession = new Map<string, number>();
    if (sessionIds.length && role) {
      const answerCounts = await PairQuestionnaireAnswer.aggregate<{
        _id: Types.ObjectId;
        answeredCount: number;
      }>([
        { $match: { sessionId: { $in: sessionIds }, by: role } },
        { $group: { _id: { sessionId: '$sessionId', questionId: '$questionId' } } },
        { $group: { _id: '$_id.sessionId', answeredCount: { $sum: 1 } } },
      ]);
      for (const answerCount of answerCounts) {
        answeredBySession.set(
          String(answerCount._id),
          answerCount.answeredCount
        );
      }
    }

    const cards = questionnaires.map((questionnaire) => {
      const questionnaireId = String(questionnaire._id);
      const session = sessionsByQuestionnaire.get(questionnaireId);
      const activeSession = session?.inProgress;
      const completedSession = session?.completed;
      const pairOnly = questionnaire.target?.type === 'couple';
      const locked = pairOnly && !pairId;
      const starter = Boolean(questionnaire.meta?.isStarter);
      const personalCompleted =
        !pairOnly && completedPersonalIds.has(questionnaireId);

      let status: QuestionnaireCardStatus = 'new';
      if (locked) status = 'locked';
      else if (activeSession) status = 'in_progress';
      else if (completedSession || personalCompleted) status = 'completed';
      else if (starter) status = 'required';

      const questionCount = questionnaire.questionCount ?? 0;
      const estimate = estimateMinutes(questionCount);
      const publicTags = (questionnaire.tags ?? []).filter(
        (tag) => !SYSTEM_TAGS.has(tag)
      );
      const tagsPublic = publicTags.slice(0, 2);
      const usedSession = activeSession ?? completedSession;
      const answered = usedSession
        ? answeredBySession.get(String(usedSession._id)) ?? 0
        : 0;
      const progressPct = personalCompleted
        ? 100
        : questionCount > 0
          ? Math.round((answered / questionCount) * 100)
          : 0;
      const cta: QuestionnaireCardCta =
        status === 'locked'
          ? 'locked'
          : status === 'completed'
            ? 'result'
            : status === 'in_progress'
              ? 'continue'
              : 'start';

      return {
        id: questionnaireId,
        domainKey: questionnaire.domainKey,
        scope: scopeFrom(questionnaire),
        audience: audienceFrom(questionnaire),
        title: toTitle(questionnaire),
        subtitle: toSubtitle(questionnaire),
        tagsPublic,
        tagsHiddenCount: Math.max(0, publicTags.length - tagsPublic.length),
        questionCount,
        estMinutesMin: estimate.min,
        estMinutesMax: estimate.max,
        level: levelFrom(questionnaire.difficulty, questionCount),
        status,
        progressPct:
          status === 'in_progress' || status === 'completed'
            ? progressPct
            : undefined,
        lockReason: locked ? 'нужна пара' : undefined,
        cta,
        isStarter: starter,
        pairId: pairId ? String(pairId) : null,
      } satisfies QuestionnaireCardDTO;
    });

    return input.scope
      ? cards.filter((card) => card.scope === input.scope)
      : cards;
  },
};
