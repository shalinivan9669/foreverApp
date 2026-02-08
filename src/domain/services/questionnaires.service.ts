import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { Question, type QuestionType } from '@/models/Question';
import { Questionnaire, type QuestionItem, type QuestionnaireType } from '@/models/Questionnaire';
import {
  PairQuestionnaireSession,
  type PairQuestionnaireSessionType,
} from '@/models/PairQuestionnaireSession';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { User, type UserType } from '@/models/User';
import {
  buildVectorUpdate,
  type VectorAnswer,
  type VectorQuestion,
} from '@/utils/vectorUpdates';
import { questionnaireTransition } from '@/domain/state/questionnaireMachine';

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
  const guard = await requirePairMember(pairId, currentUserId);
  if (!guard.ok) {
    throw await guardFailureToDomainError(guard.response);
  }
  return guard.data;
};

type QuestionWithOptionalId = QuestionItem & { _id?: string };

type WithPossibleId = { _id?: string };
const hasStringId = (obj: object): obj is { _id: string } =>
  '_id' in obj && typeof (obj as WithPossibleId)._id === 'string';

type SessionLean = {
  _id: Types.ObjectId;
  status: PairQuestionnaireSessionType['status'];
  startedAt: Date;
  finishedAt?: Date;
};

export const questionnairesService = {
  async submitBulkAnswers(input: {
    currentUserId: string;
    answers: { qid: string; ui: number }[];
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    await connectToDatabase();

    const qids = input.answers.map((answer) => answer.qid);
    const questions = await Question.find({ _id: { $in: qids } }).lean<QuestionType[]>();

    const qMap: Record<string, QuestionType> = {};
    for (const question of questions) {
      qMap[String(question._id)] = question;
    }

    const user = await User.findOne({ id: input.currentUserId }).lean<UserType | null>();
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const { setLevels, addToSet } = buildVectorUpdate(
      user,
      input.answers,
      qMap as Record<string, VectorQuestion>
    );

    const update: {
      $set: Record<string, number>;
      $addToSet?: Record<string, { $each: string[] }>;
    } = { $set: setLevels };

    if (Object.keys(addToSet).length > 0) {
      update.$addToSet = addToSet;
    }

    await User.updateOne({ id: input.currentUserId }, update);

    await emitEvent({
      event: 'ANSWERS_BULK_SUBMITTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/answers/bulk', method: 'POST' },
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        answersCount: input.answers.length,
      },
    });

    return {};
  },

  async startPairQuestionnaire(input: {
    pairId: string;
    questionnaireId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<{ sessionId: string; status: 'in_progress'; startedAt: Date }> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pair = pairData.pair;

    const users = await User.find({ id: { $in: pair.members } }).lean<(UserType & { _id: Types.ObjectId })[]>();
    if (users.length !== 2) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Pair members are missing',
      });
    }

    const memberA = users.find((user) => user.id === pair.members[0]);
    const memberB = users.find((user) => user.id === pair.members[1]);
    if (!memberA || !memberB) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Pair members are missing',
      });
    }

    const members: [Types.ObjectId, Types.ObjectId] = [memberA._id, memberB._id];

    const existing = await PairQuestionnaireSession.findOne({
      pairId: pair._id,
      questionnaireId: input.questionnaireId,
      status: 'in_progress',
    }).lean<SessionLean | null>();

    if (existing) {
      const transition = questionnaireTransition(
        {
          status: existing.status,
          startedAt: existing.startedAt,
          finishedAt: existing.finishedAt,
        },
        {
          type: 'START',
          at: new Date(),
        },
        {
          currentUserId: input.currentUserId,
          role: pairData.by,
        }
      );

      await emitEvent({
        event: 'QUESTIONNAIRE_STARTED',
        actor: { userId: input.currentUserId },
        request:
          input.auditRequest ??
          {
            route: `/api/pairs/${input.pairId}/questionnaires/${input.questionnaireId}/start`,
            method: 'POST',
          },
        context: {
          pairId: input.pairId,
          questionnaireId: input.questionnaireId,
        },
        target: {
          type: 'session',
          id: String(existing._id),
        },
        metadata: {
          pairId: input.pairId,
          questionnaireId: input.questionnaireId,
          sessionId: String(existing._id),
        },
      });

      return {
        sessionId: String(existing._id),
        status: 'in_progress',
        startedAt: transition.next.startedAt,
      };
    }

    const transition = questionnaireTransition(
      null,
      {
        type: 'START',
        at: new Date(),
      },
      {
        currentUserId: input.currentUserId,
        role: pairData.by,
      }
    );

    const session = await PairQuestionnaireSession.create({
      pairId: pair._id,
      questionnaireId: input.questionnaireId,
      members,
      startedAt: transition.next.startedAt,
      status: transition.next.status,
    });

    await emitEvent({
      event: 'QUESTIONNAIRE_STARTED',
      actor: { userId: input.currentUserId },
      request:
        input.auditRequest ??
        {
          route: `/api/pairs/${input.pairId}/questionnaires/${input.questionnaireId}/start`,
          method: 'POST',
        },
      context: {
        pairId: input.pairId,
        questionnaireId: input.questionnaireId,
      },
      target: {
        type: 'session',
        id: String(session._id),
      },
      metadata: {
        pairId: input.pairId,
        questionnaireId: input.questionnaireId,
        sessionId: String(session._id),
      },
    });

    return {
      sessionId: String(session._id),
      status: 'in_progress',
      startedAt: transition.next.startedAt,
    };
  },

  async answerPairQuestionnaire(input: {
    pairId: string;
    questionnaireId: string;
    sessionId?: string;
    questionId: string;
    ui: number;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    await connectToDatabase();

    if (input.sessionId && !Types.ObjectId.isValid(input.sessionId)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Invalid sessionId',
      });
    }

    const sessionFilter = input.sessionId
      ? {
          _id: new Types.ObjectId(input.sessionId),
          pairId: pairData.pair._id,
          questionnaireId: input.questionnaireId,
          status: 'in_progress' as const,
        }
      : {
          pairId: pairData.pair._id,
          questionnaireId: input.questionnaireId,
          status: 'in_progress' as const,
        };

    const session = input.sessionId
      ? await PairQuestionnaireSession.findOne(sessionFilter).lean<SessionLean | null>()
      : await PairQuestionnaireSession.findOne(sessionFilter)
          .sort({ createdAt: -1 })
          .lean<SessionLean | null>();

    if (!session) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'No active questionnaire session',
      });
    }

    const now = new Date();
    const transition = questionnaireTransition(
      {
        status: session.status,
        startedAt: session.startedAt,
        finishedAt: session.finishedAt,
      },
      {
        type: 'ANSWER',
        at: now,
      },
      {
        currentUserId: input.currentUserId,
        role: pairData.by,
      }
    );

    await PairQuestionnaireAnswer.updateOne(
      {
        sessionId: session._id,
        questionId: input.questionId,
        by: pairData.by,
      },
      {
        $set: {
          ui: input.ui,
          at: now,
          pairId: pairData.pair._id,
          questionnaireId: input.questionnaireId,
        },
      },
      { upsert: true }
    );

    await PairQuestionnaireSession.updateOne(
      { _id: session._id },
      {
        $set: {
          meta: transition.next.meta,
        },
      }
    );

    const answers = await PairQuestionnaireAnswer.find({
      sessionId: session._id,
      by: pairData.by,
    }).lean<{ questionId: string; ui: number }[]>();

    const questionnaire = await Questionnaire.findOne({ _id: input.questionnaireId }).lean<QuestionnaireType | null>();
    if (!questionnaire) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Questionnaire not found',
      });
    }

    const qMap: Record<string, QuestionWithOptionalId> = {};
    for (const question of questionnaire.questions ?? []) {
      if (question.id) {
        qMap[question.id] = question;
      }
      if (hasStringId(question as object)) {
        const questionWithId = question as QuestionWithOptionalId;
        if (questionWithId._id) {
          qMap[questionWithId._id] = questionWithId;
        }
      }
    }

    const user = await User.findOne({ id: input.currentUserId }).lean<UserType | null>();
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const vectorAnswers: VectorAnswer[] = answers.map((answer) => ({
      qid: answer.questionId,
      ui: answer.ui,
    }));

    const { setLevels, addToSet } = buildVectorUpdate(
      user,
      vectorAnswers,
      qMap as Record<string, VectorQuestion>
    );

    const update: {
      $set: Record<string, number>;
      $addToSet?: Record<string, { $each: string[] }>;
    } = { $set: setLevels };

    if (Object.keys(addToSet).length > 0) {
      update.$addToSet = addToSet;
    }

    await User.updateOne({ id: input.currentUserId }, update);

    await emitEvent({
      event: 'QUESTIONNAIRE_ANSWERED',
      actor: { userId: input.currentUserId },
      request:
        input.auditRequest ??
        {
          route: `/api/pairs/${input.pairId}/questionnaires/${input.questionnaireId}/answer`,
          method: 'POST',
        },
      context: {
        pairId: input.pairId,
        questionnaireId: input.questionnaireId,
      },
      target: {
        type: 'session',
        id: String(session._id),
      },
      metadata: {
        pairId: input.pairId,
        questionnaireId: input.questionnaireId,
        sessionId: String(session._id),
        questionId: input.questionId,
        ui: input.ui,
      },
    });

    return {};
  },
};
