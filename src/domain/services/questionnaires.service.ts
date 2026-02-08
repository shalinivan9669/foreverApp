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
  AXES,
  applyDeltaToUserVectors,
  evaluatePersonalQuestionnaireCooldown,
  scoreAnswersToVectorDelta,
  toVectorQuestionMap,
  type Axis,
  type PersonalCooldownReason,
  type VectorAnswerInput,
  type VectorDelta,
  type VectorQuestion,
  type VectorQuestionSource,
  type UserVectorApplyResult,
} from '@/domain/vectors';
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

type BulkSubmitAudience = 'personal' | 'couple';

const buildQuestionMapFromQuestionDocs = (
  questions: QuestionType[]
): Record<string, VectorQuestion> =>
  toVectorQuestionMap(
    questions.map((question) => ({
      id: String(question._id),
      _id: String(question._id),
      axis: question.axis,
      facet: question.facet,
      map: question.map,
      weight: question.weight,
      polarity: question.polarity,
    }))
  );

const buildQuestionMapFromQuestionnaire = (
  questionnaire: QuestionnaireType
): Record<string, VectorQuestion> => {
  const sources: VectorQuestionSource[] = [];

  for (const question of questionnaire.questions ?? []) {
    sources.push({
      id: question.id,
      axis: question.axis,
      facet: question.facet,
      map: question.map,
      weight: question.weight,
      polarity: question.polarity,
    });

    if (hasStringId(question as object)) {
      const questionWithId = question as QuestionWithOptionalId;
      if (questionWithId._id) {
        sources.push({
          _id: questionWithId._id,
          axis: question.axis,
          facet: question.facet,
          map: question.map,
          weight: question.weight,
          polarity: question.polarity,
        });
      }
    }
  }

  return toVectorQuestionMap(sources);
};

const roundTo3 = (value: number): number => Math.round(value * 1000) / 1000;

const toRoundedAppliedSteps = (
  applied: UserVectorApplyResult
): Partial<Record<Axis, number>> => {
  const rounded: Partial<Record<Axis, number>> = {};
  for (const axis of AXES) {
    if (!Object.prototype.hasOwnProperty.call(applied.appliedStepByAxis, axis)) continue;
    const raw = Number(applied.appliedStepByAxis[axis] ?? 0);
    if (!Number.isFinite(raw)) continue;
    rounded[axis] = roundTo3(raw);
  }
  return rounded;
};

const toVectorAuditMetrics = (
  delta: VectorDelta,
  applied?: UserVectorApplyResult
) => {
  const sumWeightsTotal = AXES.reduce((acc, axis) => {
    const axisWeight = Number(delta.perAxisSumWeights[axis] ?? 0);
    return Number.isFinite(axisWeight) ? acc + axisWeight : acc;
  }, 0);

  if (!applied) {
    return {
      answeredCount: delta.answeredCount,
      matchedCount: delta.matchedCount,
      confidence: 0,
      sumWeightsTotal: roundTo3(sumWeightsTotal),
      deltaMagnitude: 0,
      appliedStepByAxis: {},
      clampedAxes: [],
    };
  }

  const deltaMagnitude = AXES.reduce((acc, axis) => {
    const step = Number(applied.appliedStepByAxis[axis] ?? 0);
    return Number.isFinite(step) ? acc + Math.abs(step) : acc;
  }, 0);

  return {
    answeredCount: delta.answeredCount,
    matchedCount: delta.matchedCount,
    confidence: roundTo3(applied.confidence),
    sumWeightsTotal: roundTo3(sumWeightsTotal),
    deltaMagnitude: roundTo3(deltaMagnitude),
    appliedStepByAxis: toRoundedAppliedSteps(applied),
    clampedAxes: applied.clampedAxes,
  };
};

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
    questionnaireId?: string;
    strictQuestionMatch?: boolean;
    audience?: BulkSubmitAudience;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    await connectToDatabase();

    const user = await User.findOne({ id: input.currentUserId }).lean<UserType | null>();
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    let questionMap: Record<string, VectorQuestion>;
    if (input.questionnaireId) {
      const questionnaire = await Questionnaire.findOne({ _id: input.questionnaireId }).lean<QuestionnaireType | null>();
      if (!questionnaire) {
        throw new DomainError({
          code: 'NOT_FOUND',
          status: 404,
          message: 'Questionnaire not found',
        });
      }
      questionMap = buildQuestionMapFromQuestionnaire(questionnaire);
    } else {
      const qids = input.answers.map((answer) => answer.qid);
      const questions = await Question.find({ _id: { $in: qids } }).lean<QuestionType[]>();
      questionMap = buildQuestionMapFromQuestionDocs(questions);
    }

    const vectorAnswers: VectorAnswerInput[] = input.answers.map((answer) => ({
      qid: answer.qid,
      ui: answer.ui,
    }));

    const delta = scoreAnswersToVectorDelta(vectorAnswers, questionMap);
    if (input.strictQuestionMatch && delta.matchedCount === 0) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'No matching questionnaire questions for provided answers',
      });
    }

    const audience = input.audience ?? 'personal';
    const cooldown = audience === 'personal'
      ? evaluatePersonalQuestionnaireCooldown({
          questionnaireId: input.questionnaireId,
          vectorsMeta: user.vectorsMeta,
        })
      : null;

    const shouldApplyVectors = cooldown ? cooldown.applied : true;
    const applied = shouldApplyVectors ? applyDeltaToUserVectors(user, delta) : undefined;
    const vectorAudit = toVectorAuditMetrics(delta, applied);

    if (applied) {
      const setPayload: Record<string, number | Date> = { ...applied.setLevels };
      if (audience === 'personal' && delta.matchedCount > 0 && cooldown?.applied) {
        setPayload[
          `vectorsMeta.personalQuestionnaireCooldowns.${cooldown.questionnaireKey}`
        ] = cooldown.appliedAt;
      }

      const hasSet = Object.keys(setPayload).length > 0;
      const hasAddToSet = Object.keys(applied.addToSet).length > 0;
      const update: {
        $set: Record<string, number | Date>;
        $addToSet?: Record<string, { $each: string[] }>;
      } = { $set: setPayload };

      if (hasSet || hasAddToSet) {
        if (hasAddToSet) {
          update.$addToSet = applied.addToSet;
        }

        await User.updateOne({ id: input.currentUserId }, update);
      }
    }

    const antiFarmReason: PersonalCooldownReason = cooldown?.reason ?? 'APPLIED';
    const antiFarmApplied = cooldown?.applied ?? true;
    const auditQuestionnaireId = input.questionnaireId ?? cooldown?.questionnaireKey;

    await emitEvent({
      event: 'ANSWERS_BULK_SUBMITTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/answers/bulk', method: 'POST' },
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        answersCount: delta.answeredCount,
        ...vectorAudit,
        audience,
        questionnaireId: auditQuestionnaireId,
        applied: antiFarmApplied,
        reason: antiFarmReason,
        cooldownDays: cooldown?.cooldownDays,
        scoringVersion: 'v2',
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

    const questionMap = buildQuestionMapFromQuestionnaire(questionnaire);

    const user = await User.findOne({ id: input.currentUserId }).lean<UserType | null>();
    if (!user) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const vectorAnswers: VectorAnswerInput[] = answers.map((answer) => ({
      qid: answer.questionId,
      ui: answer.ui,
    }));

    const delta = scoreAnswersToVectorDelta(vectorAnswers, questionMap);
    const applied = applyDeltaToUserVectors(user, delta);
    const vectorAudit = toVectorAuditMetrics(delta, applied);

    const hasSet = Object.keys(applied.setLevels).length > 0;
    const hasAddToSet = Object.keys(applied.addToSet).length > 0;

    if (hasSet || hasAddToSet) {
      const update: {
        $set: Record<string, number>;
        $addToSet?: Record<string, { $each: string[] }>;
      } = { $set: applied.setLevels };

      if (hasAddToSet) {
        update.$addToSet = applied.addToSet;
      }

      await User.updateOne({ id: input.currentUserId }, update);
    }

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
        ...vectorAudit,
      },
    });

    return {};
  },
};
