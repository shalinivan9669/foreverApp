import { createHash } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import {
  Questionnaire,
  publishedQuestionnaireFilter,
  type QuestionnaireType,
} from '@/models/Questionnaire';
import {
  PairQuestionnaireSession,
  type PairQuestionnaireSessionType,
} from '@/models/PairQuestionnaireSession';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { economyService } from '@/domain/services/economy.service';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { PersonalQuestionnaireSubmission } from '@/models/PersonalQuestionnaireSubmission';
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

type QuestionnaireAnswerInput = { qid: string; ui: number };
type QuestionScaleDefinition = {
  id: string;
  optionCount: number;
  contentRevision: string;
};

const buildQuestionMapFromQuestionnaire = (
  questionnaire: QuestionnaireType
): Map<string, QuestionScaleDefinition> => {
  const questions = new Map<string, QuestionScaleDefinition>();
  for (const question of questionnaire.questions ?? []) {
    const definition = {
      id: question.id,
      optionCount: question.optionCount,
      contentRevision: question.contentRevision,
    };
    questions.set(question.id, definition);
  }
  return questions;
};

const validateQuestionnaireAnswers = (
  answers: QuestionnaireAnswerInput[],
  questionMap: Map<string, QuestionScaleDefinition>,
  options: { requireComplete: boolean }
): Array<{ questionId: string; ui: number; contentRevision: string }> => {
  if (questionMap.size === 0) {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Questionnaire has no publishable questions',
    });
  }

  const seenQuestionIds = new Set<string>();
  const canonicalAnswers: Array<{
    questionId: string;
    ui: number;
    contentRevision: string;
  }> = [];
  for (const answer of answers) {
    if (seenQuestionIds.has(answer.qid)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Questionnaire answer is duplicated',
      });
    }
    seenQuestionIds.add(answer.qid);
    const question = questionMap.get(answer.qid);
    if (!question) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Unknown questionnaire question',
      });
    }

    if (
      !Number.isInteger(answer.ui) ||
      answer.ui < 1 ||
      answer.ui > question.optionCount
    ) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Answer ui is outside the question scale',
      });
    }

    canonicalAnswers.push({
      questionId: question.id,
      ui: answer.ui,
      contentRevision: question.contentRevision,
    });
  }

  if (options.requireComplete && seenQuestionIds.size !== questionMap.size) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Every questionnaire question must be explicitly answered',
    });
  }

  return canonicalAnswers.sort((left, right) =>
    left.questionId.localeCompare(right.questionId)
  );
};

const submissionIdentity = (input: {
  userId: string;
  questionnaireId: string;
  questionnaireVersion: number;
  answers: Array<{ questionId: string; ui: number; contentRevision: string }>;
}): { submissionId: string; contentHash: string } => {
  const canonicalAnswers = [...input.answers]
    .sort((left, right) => left.questionId.localeCompare(right.questionId))
    .map(
      (answer) =>
        `${answer.questionId}:${answer.contentRevision}:${answer.ui}`
    )
    .join('|');
  const contentHash = createHash('sha256').update(canonicalAnswers).digest('hex');
  const submissionId = `pqs_${createHash('sha256')
    .update(
      [
        input.userId,
        input.questionnaireId,
        String(input.questionnaireVersion),
        contentHash,
      ].join('|')
    )
    .digest('hex')
    .slice(0, 40)}`;
  return { submissionId, contentHash };
};

type SessionLean = {
  _id: Types.ObjectId;
  status: PairQuestionnaireSessionType['status'];
  startedAt: Date;
  finishedAt?: Date;
};

type ActivePairFence = {
  _id: Types.ObjectId;
  members: [string, string];
  by: 'A' | 'B';
};

export type QuestionnaireReliabilityTestHooks = {
  beforePairFence?: () => Promise<void>;
};

const stateConflict = (message: string): never => {
  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message,
  });
};

const fenceActivePair = async (input: {
  pairId: Types.ObjectId;
  currentUserId: string;
  session: ClientSession;
}): Promise<ActivePairFence> => {
  const pair = await Pair.findOneAndUpdate(
    {
      _id: input.pairId,
      members: input.currentUserId,
      status: 'active',
    },
    { $inc: { lifecycleRevision: 1 } },
    { new: true, session: input.session }
  )
    .select({ _id: 1, members: 1 })
    .lean<{ _id: Types.ObjectId; members: [string, string] } | null>();

  if (!pair) return stateConflict('Pair is not active');

  const by =
    pair.members[0] === input.currentUserId
      ? 'A'
      : pair.members[1] === input.currentUserId
        ? 'B'
        : null;
  if (!by) return stateConflict('Pair membership changed concurrently');

  return { ...pair, by };
};

const createOneShotHook = (
  hook: (() => Promise<void>) | undefined
): (() => Promise<void>) => {
  let consumed = false;
  return async () => {
    if (consumed || !hook) return;
    consumed = true;
    await hook();
  };
};

const requireUnambiguousInProgressSession = async (input: {
  pairId: Types.ObjectId;
  questionnaireId: string;
  sessionId?: Types.ObjectId;
  session: ClientSession;
}): Promise<SessionLean | null> => {
  const sessions = await PairQuestionnaireSession.find({
    ...(input.sessionId ? { _id: input.sessionId } : {}),
    pairId: input.pairId,
    questionnaireId: input.questionnaireId,
    status: 'in_progress',
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(2)
    .session(input.session)
    .lean<SessionLean[]>();

  if (sessions.length > 1) {
    stateConflict('Duplicate in-progress questionnaire sessions require migration');
  }
  return sessions[0] ?? null;
};

const findSessionForAnswer = async (input: {
  pairId: Types.ObjectId;
  questionnaireId: string;
  sessionId?: Types.ObjectId;
  session: ClientSession;
}): Promise<SessionLean | null> => {
  if (input.sessionId) {
    return PairQuestionnaireSession.findOne({
      _id: input.sessionId,
      pairId: input.pairId,
      questionnaireId: input.questionnaireId,
    })
      .session(input.session)
      .lean<SessionLean | null>();
  }
  return requireUnambiguousInProgressSession(input);
};

const findUnambiguousStoredAnswer = async (input: {
  sessionId: Types.ObjectId;
  questionId: string;
  by: 'A' | 'B';
  session: ClientSession;
}): Promise<{ ui: number } | null> => {
  const answers = await PairQuestionnaireAnswer.find({
    sessionId: input.sessionId,
    questionId: input.questionId,
    by: input.by,
  })
    .select({ ui: 1 })
    .limit(2)
    .session(input.session)
    .lean<Array<{ ui: number }>>();
  if (answers.length > 1) {
    stateConflict('Duplicate questionnaire answers require migration');
  }
  return answers[0] ?? null;
};

export const questionnairesService = {
  async submitBulkAnswers(input: {
    currentUserId: string;
    answers: { qid: string; ui: number }[];
    questionnaireId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    await connectToDatabase();

    const userExists = await User.exists({ id: input.currentUserId });
    if (!userExists) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    const questionnaire = await Questionnaire.findOne({
      _id: input.questionnaireId,
      ...publishedQuestionnaireFilter(),
    }).lean<QuestionnaireType | null>();
    if (!questionnaire) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Questionnaire not found',
      });
    }
    if (questionnaire.target.type !== 'individual') {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Couple questionnaire requires a pair session',
      });
    }
    const questionMap = buildQuestionMapFromQuestionnaire(questionnaire);
    await economyService.assertContentAccess({
      userId: input.currentUserId,
      contentKey: input.questionnaireId,
    });
    const canonicalAnswers = validateQuestionnaireAnswers(input.answers, questionMap, {
      requireComplete: true,
    });
    const identity = submissionIdentity({
      userId: input.currentUserId,
      questionnaireId: input.questionnaireId,
      questionnaireVersion: questionnaire.version,
      answers: canonicalAnswers,
    });
    try {
      await PersonalQuestionnaireSubmission.updateOne(
        { submissionId: identity.submissionId },
        {
          $setOnInsert: {
            submissionId: identity.submissionId,
            userId: input.currentUserId,
            questionnaireId: input.questionnaireId,
            questionnaireVersion: questionnaire.version,
            questionnaireContentModel: questionnaire.contentModel,
            answers: canonicalAnswers,
            contentHash: identity.contentHash,
            captureMode: 'PRIVATE',
            retentionClass: 'OWNER_CONTROLLED',
            semanticStatus: 'UNMAPPED',
            submittedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) {
        throw error;
      }
      const existing = await PersonalQuestionnaireSubmission.exists({
        submissionId: identity.submissionId,
        userId: input.currentUserId,
        questionnaireId: input.questionnaireId,
        questionnaireVersion: questionnaire.version,
        contentHash: identity.contentHash,
      });
      if (!existing) throw error;
    }

    // One reward per questionnaire, independent of answer content and repeated
    // submissions. Retrying a stored completion also repairs a missed reward.
    await economyService.rewardCompletion({
      userId: input.currentUserId,
      sourceKind: 'QUESTIONNAIRE',
      sourceId: `questionnaire:${input.questionnaireId}`,
    });

    await emitEvent({
      event: 'ANSWERS_BULK_SUBMITTED',
      actor: { userId: input.currentUserId },
      request:
        input.auditRequest ?? {
          route: `/api/questionnaires/${input.questionnaireId}`,
          method: 'POST',
        },
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        answersCount: canonicalAnswers.length,
        audience: 'personal',
        questionnaireId: input.questionnaireId,
        questionnaireVersion: questionnaire.version,
        captureMode: 'PRIVATE',
        semanticStatus: 'UNMAPPED',
      },
    });

    return {};
  },

  async startPairQuestionnaire(input: {
    pairId: string;
    questionnaireId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }, hooks: QuestionnaireReliabilityTestHooks = {}): Promise<{
    sessionId: string;
    status: 'in_progress';
    startedAt: Date;
  }> {
    await connectToDatabase();
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pairData.pair._id as Types.ObjectId;

    const questionnaire = await Questionnaire.findOne({
      _id: input.questionnaireId,
      'target.type': 'couple',
      ...publishedQuestionnaireFilter(),
    }).lean<QuestionnaireType | null>();
    if (!questionnaire || questionnaire.questions.length === 0) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Couple questionnaire not found',
      });
    }

    const startedAt = new Date();
    const runBeforePairFence = createOneShotHook(hooks.beforePairFence);
    const mongoSession = await mongoose.startSession();
    let result:
      | { sessionId: string; status: 'in_progress'; startedAt: Date }
      | undefined;
    try {
      result = await mongoSession.withTransaction(async () => {
        await runBeforePairFence();
        const fencedPair = await fenceActivePair({
          pairId,
          currentUserId: input.currentUserId,
          session: mongoSession,
        });
        const existing = await requireUnambiguousInProgressSession({
          pairId,
          questionnaireId: input.questionnaireId,
          session: mongoSession,
        });

        if (existing) {
          const transition = questionnaireTransition(
            {
              status: existing.status,
              startedAt: existing.startedAt,
              finishedAt: existing.finishedAt,
            },
            { type: 'START', at: startedAt },
            {
              currentUserId: input.currentUserId,
              role: fencedPair.by,
            }
          );
          return {
            sessionId: String(existing._id),
            status: 'in_progress' as const,
            startedAt: transition.next.startedAt,
          };
        }

        const users = await User.find({ id: { $in: fencedPair.members } })
          .session(mongoSession)
          .lean<(UserType & { _id: Types.ObjectId })[]>();
        if (users.length !== 2) {
          throw new DomainError({
            code: 'NOT_FOUND',
            status: 404,
            message: 'Pair members are missing',
          });
        }

        const memberA = users.find((user) => user.id === fencedPair.members[0]);
        const memberB = users.find((user) => user.id === fencedPair.members[1]);
        if (!memberA || !memberB) {
          throw new DomainError({
            code: 'NOT_FOUND',
            status: 404,
            message: 'Pair members are missing',
          });
        }

        const transition = questionnaireTransition(
          null,
          { type: 'START', at: startedAt },
          {
            currentUserId: input.currentUserId,
            role: fencedPair.by,
          }
        );
        const created = await PairQuestionnaireSession.create(
          [
            {
              pairId,
              questionnaireId: input.questionnaireId,
              members: [memberA._id, memberB._id],
              startedAt: transition.next.startedAt,
              status: transition.next.status,
            },
          ],
          { session: mongoSession }
        );
        const session = created[0];
        if (!session) {
          throw new DomainError({
            code: 'INTERNAL',
            status: 500,
            message: 'Questionnaire session was not created',
          });
        }
        return {
          sessionId: String(session._id),
          status: 'in_progress' as const,
          startedAt: transition.next.startedAt,
        };
      });
    } finally {
      await mongoSession.endSession();
    }

    if (!result) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Questionnaire transaction did not return a result',
      });
    }

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
        id: result.sessionId,
      },
      metadata: {
        pairId: input.pairId,
        questionnaireId: input.questionnaireId,
        sessionId: result.sessionId,
      },
    });

    return result;
  },

  async answerPairQuestionnaire(input: {
    pairId: string;
    questionnaireId: string;
    sessionId?: string;
    questionId: string;
    ui: number;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }, hooks: QuestionnaireReliabilityTestHooks = {}): Promise<Record<string, never>> {
    await connectToDatabase();
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);
    const pairId = pairData.pair._id as Types.ObjectId;

    if (input.sessionId && !Types.ObjectId.isValid(input.sessionId)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Invalid sessionId',
      });
    }

    const questionnaire = await Questionnaire.findOne({
      _id: input.questionnaireId,
      'target.type': 'couple',
      ...publishedQuestionnaireFilter(),
    }).lean<QuestionnaireType | null>();
    if (!questionnaire) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Questionnaire not found',
      });
    }

    const questionMap = buildQuestionMapFromQuestionnaire(questionnaire);
    const currentAnswer: QuestionnaireAnswerInput = {
      qid: input.questionId,
      ui: input.ui,
    };
    validateQuestionnaireAnswers([currentAnswer], questionMap, {
      requireComplete: false,
    });

    const questionnaireQuestionIds = questionnaire.questions.map((question) => question.id);
    const now = new Date();
    const runBeforePairFence = createOneShotHook(hooks.beforePairFence);
    const mongoSession = await mongoose.startSession();
    let committed:
      | {
          sessionId: string;
          insertedNewAnswer: boolean;
          shouldComplete: boolean;
        }
      | undefined;
    try {
      committed = await mongoSession.withTransaction(async () => {
        await runBeforePairFence();
        const fencedPair = await fenceActivePair({
          pairId,
          currentUserId: input.currentUserId,
          session: mongoSession,
        });
        const session = await findSessionForAnswer({
          pairId,
          questionnaireId: input.questionnaireId,
          sessionId: input.sessionId
            ? new Types.ObjectId(input.sessionId)
            : undefined,
          session: mongoSession,
        });
        if (!session) {
          throw new DomainError({
            code: 'NOT_FOUND',
            status: 404,
            message: 'No active questionnaire session',
          });
        }

        const answerIdentity = {
          sessionId: session._id,
          questionId: input.questionId,
          by: fencedPair.by,
        };
        const existingAnswer = await findUnambiguousStoredAnswer({
          ...answerIdentity,
          session: mongoSession,
        });
        if (session.status !== 'in_progress') {
          if (session.status === 'completed' && existingAnswer?.ui === input.ui) {
            return {
              sessionId: String(session._id),
              insertedNewAnswer: false,
              shouldComplete: true,
            };
          }
          stateConflict('Questionnaire session is terminal');
        }
        if (existingAnswer && existingAnswer.ui !== input.ui) {
          stateConflict('Questionnaire answer is immutable once recorded');
        }

        const transition = questionnaireTransition(
          {
            status: session.status,
            startedAt: session.startedAt,
            finishedAt: session.finishedAt,
          },
          { type: 'ANSWER', at: now },
          {
            currentUserId: input.currentUserId,
            role: fencedPair.by,
          }
        );
        const insertedNewAnswer = !existingAnswer;
        if (insertedNewAnswer) {
          await PairQuestionnaireAnswer.updateOne(
            answerIdentity,
            {
              $setOnInsert: {
                ui: input.ui,
                at: now,
                pairId,
                questionnaireId: input.questionnaireId,
              },
            },
            { upsert: true, session: mongoSession }
          );
        }

        const storedAnswer = await findUnambiguousStoredAnswer({
          ...answerIdentity,
          session: mongoSession,
        });
        if (!storedAnswer || storedAnswer.ui !== input.ui) {
          stateConflict('Questionnaire answer is immutable once recorded');
        }

        const answeredCounts = await PairQuestionnaireAnswer.aggregate<{
          _id: 'A' | 'B';
          answeredCount: number;
        }>([
          {
            $match: {
              sessionId: session._id,
              questionId: { $in: questionnaireQuestionIds },
            },
          },
          { $group: { _id: { by: '$by', questionId: '$questionId' } } },
          { $group: { _id: '$_id.by', answeredCount: { $sum: 1 } } },
        ]).session(mongoSession);

        const answeredCountByRole = new Map<'A' | 'B', number>(
          answeredCounts.map((item) => [item._id, item.answeredCount])
        );
        const questionCount = questionnaire.questions.length;
        const shouldComplete =
          questionCount > 0 &&
          (answeredCountByRole.get('A') ?? 0) >= questionCount &&
          (answeredCountByRole.get('B') ?? 0) >= questionCount;
        const sessionSet: {
          status?: PairQuestionnaireSessionType['status'];
          finishedAt?: Date;
          meta?: typeof transition.next.meta;
        } = { meta: transition.next.meta };

        if (shouldComplete) {
          const completeTransition = questionnaireTransition(
            {
              status: session.status,
              startedAt: session.startedAt,
              finishedAt: session.finishedAt,
            },
            { type: 'COMPLETE', at: now },
            {
              currentUserId: input.currentUserId,
              role: fencedPair.by,
            }
          );
          sessionSet.status = completeTransition.next.status;
          sessionSet.finishedAt = completeTransition.next.finishedAt;
        }

        const sessionWrite = await PairQuestionnaireSession.updateOne(
          { _id: session._id, status: 'in_progress' },
          { $set: sessionSet },
          { session: mongoSession }
        );
        if (sessionWrite.matchedCount !== 1) {
          stateConflict('Questionnaire session changed concurrently');
        }
        return {
          sessionId: String(session._id),
          insertedNewAnswer,
          shouldComplete,
        };
      });
    } finally {
      await mongoSession.endSession();
    }

    if (!committed) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Questionnaire transaction did not return a result',
      });
    }

    if (committed.shouldComplete) {
      for (const userId of pairData.pair.members) {
        await economyService.rewardCompletion({
          userId,
          sourceKind: 'QUESTIONNAIRE',
          sourceId: `pair-questionnaire:${input.questionnaireId}`,
        });
      }
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
        id: committed.sessionId,
      },
      metadata: {
        pairId: input.pairId,
        questionnaireId: input.questionnaireId,
        sessionId: committed.sessionId,
        questionId: input.questionId,
        insertedNewAnswer: committed.insertedNewAnswer,
        exactPartnerAnswerDisclosed: false,
        pairSummaryStatus: committed.shouldComplete ? 'INSUFFICIENT_DATA' : 'PENDING',
      },
    });

    return {};
  },
};
