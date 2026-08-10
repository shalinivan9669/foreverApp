import { Types, type ClientSession } from 'mongoose';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import {
  Questionnaire,
  publishedQuestionnaireFilter,
  type QuestionnaireType,
} from '@/models/Questionnaire';
import type { UserType } from '@/models/User';
import { AXES, scoreAnswersToVectorDelta, toVectorQuestionMap, type Axis } from '@/domain/vectors';
import {
  DEFAULT_SCORING_CONFIG,
  readAxisLayer,
} from '@/domain/services/vectorScoring.service';
import {
  buildPairDiagnostics,
  type PairAxisDiagnostic,
  type PairAxisDiagnosticStatus,
} from '@/domain/services/pairDiagnostics.service';

export type PairAnswerAxisSignal = {
  axis: Axis;
  a: number;
  b: number;
  confidenceA: number;
  confidenceB: number;
  pairConfidence: number;
  delta: number;
  status: PairAxisDiagnosticStatus;
  reasons: string[];
  recommendedAction?: string;
};

export type PairAnswerDiagnosticsResult = ReturnType<typeof buildPairDiagnostics> & {
  pairAnswerSignals: PairAnswerAxisSignal[];
  overall: {
    score: number;
    confidence: number;
    status: 'strong' | 'neutral' | 'risk' | 'insufficient_data';
  };
  generatedInsightIds: string[];
};

type AnswerRow = {
  questionId: string;
  by: 'A' | 'B';
  ui: number;
};

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const targetFromDelta = (delta: number | undefined): number =>
  clamp01(((Number(delta) || 0) + 1) / 2);

const confidenceFromCount = (count: number): number =>
  clamp01(1 - Math.exp(-Math.max(0, count) / DEFAULT_SCORING_CONFIG.confidenceK));

const statusForSignal = (
  a: number,
  b: number,
  confidence: number
): PairAxisDiagnosticStatus => {
  const thresholds = DEFAULT_SCORING_CONFIG.axisThresholds;
  const delta = Math.abs(a - b);
  if (confidence < DEFAULT_SCORING_CONFIG.lowConfidenceThreshold) return 'insufficient_data';
  if (a >= thresholds.high && b >= thresholds.high && delta <= thresholds.deltaModerate) {
    return 'strong';
  }
  if (delta >= thresholds.deltaHigh || (a <= thresholds.low && b <= thresholds.low)) {
    return 'risk';
  }
  if (delta >= thresholds.deltaModerate) return 'complement';
  return 'neutral';
};

const reasonForSignal = (status: PairAxisDiagnosticStatus): string[] => {
  if (status === 'insufficient_data') {
    return ['Данных по парной анкете пока мало, чтобы делать вывод по этой зоне.'];
  }
  if (status === 'risk') {
    return ['По парным ответам видно заметное различие в ожиданиях. Это не приговор, но правила лучше обсудить заранее.'];
  }
  if (status === 'strong') {
    return ['По парным ответам видно, что здесь у вас есть общая база. Это хороший ресурс для договоренностей.'];
  }
  if (status === 'complement') {
    return ['Разные подходы могут дополнять друг друга, если заранее проговорить правила.'];
  }
  return ['По парным ответам нет выраженного сигнала риска в этой зоне.'];
};

const actionForSignal = (status: PairAxisDiagnosticStatus): string | undefined => {
  if (status === 'risk') {
    return 'Обсудить правила заранее и договориться об одном коротком следующем шаге.';
  }
  if (status === 'complement') {
    return 'Зафиксировать, где разные подходы помогают, а где нужны явные правила.';
  }
  if (status === 'insufficient_data') {
    return 'Пройти еще одну короткую парную анкету.';
  }
  return undefined;
};

const buildQuestionMap = (questionnaire: QuestionnaireType) =>
  toVectorQuestionMap(
    questionnaire.questions.map((question) => ({
      id: question.id,
      axis: question.axis,
      facet: question.facet,
      map: question.map,
      weight: question.weight,
      polarity: question.polarity,
    }))
  );

const scoreRole = (
  role: 'A' | 'B',
  answers: AnswerRow[],
  questionMap: ReturnType<typeof buildQuestionMap>
) => {
  const roleAnswers = answers
    .filter((answer) => answer.by === role)
    .map((answer) => ({ qid: answer.questionId, ui: answer.ui }));
  return scoreAnswersToVectorDelta(roleAnswers, questionMap);
};

export const buildPairAnswerDiagnostics = async (input: {
  pairId: string;
  sessionId?: string;
  left: UserType;
  right: UserType;
  mongoSession?: ClientSession;
}): Promise<PairAnswerDiagnosticsResult> => {
  const sessionFilter = input.sessionId
    ? { _id: new Types.ObjectId(input.sessionId), pairId: new Types.ObjectId(input.pairId) }
    : { pairId: new Types.ObjectId(input.pairId), status: 'completed' as const };

  const sessionQuery = PairQuestionnaireSession.findOne(sessionFilter).sort({
    finishedAt: -1,
    createdAt: -1,
  });
  if (input.mongoSession) sessionQuery.session(input.mongoSession);
  const session = await sessionQuery.lean<{
    _id: Types.ObjectId;
    questionnaireId: string;
  } | null>();

  const traitDiagnostics = buildPairDiagnostics(input.left, input.right);
  if (!session) {
    return {
      ...traitDiagnostics,
      pairAnswerSignals: [],
      overall: {
        score: 0,
        confidence: 0,
        status: 'insufficient_data',
      },
      generatedInsightIds: [],
    };
  }

  const questionnaireQuery = Questionnaire.findOne({
    _id: session.questionnaireId,
    ...publishedQuestionnaireFilter(),
  });
  const answersQuery = PairQuestionnaireAnswer.find({ sessionId: session._id });
  if (input.mongoSession) {
    questionnaireQuery.session(input.mongoSession);
    answersQuery.session(input.mongoSession);
  }
  const questionnaire = await questionnaireQuery.lean<QuestionnaireType | null>();
  const answers = await answersQuery.lean<AnswerRow[]>();

  if (!questionnaire) {
    return {
      ...traitDiagnostics,
      pairAnswerSignals: [],
      overall: {
        score: 0,
        confidence: 0,
        status: 'insufficient_data',
      },
      generatedInsightIds: [],
    };
  }

  const questionMap = buildQuestionMap(questionnaire);
  const aDelta = scoreRole('A', answers, questionMap);
  const bDelta = scoreRole('B', answers, questionMap);
  const pairAnswerSignals: PairAnswerAxisSignal[] = [];
  const axes: PairAxisDiagnostic[] = [];

  for (const axis of AXES) {
    const leftTrait = readAxisLayer(input.left, axis, 'trait');
    const rightTrait = readAxisLayer(input.right, axis, 'trait');
    const answerA = targetFromDelta(aDelta.levelDeltaByAxis[axis]);
    const answerB = targetFromDelta(bDelta.levelDeltaByAxis[axis]);
    const confidenceA = confidenceFromCount(aDelta.perAxisMatchedCount[axis] ?? 0);
    const confidenceB = confidenceFromCount(bDelta.perAxisMatchedCount[axis] ?? 0);
    const pairConfidence = Math.min(
      Math.max(leftTrait.confidence, confidenceA),
      Math.max(rightTrait.confidence, confidenceB)
    );
    const combinedA = confidenceA > 0 ? clamp01(leftTrait.level * 0.6 + answerA * 0.4) : leftTrait.level;
    const combinedB = confidenceB > 0 ? clamp01(rightTrait.level * 0.6 + answerB * 0.4) : rightTrait.level;
    const status = statusForSignal(combinedA, combinedB, pairConfidence);
    const delta = Math.abs(combinedA - combinedB);
    const signal: PairAnswerAxisSignal = {
      axis,
      a: combinedA,
      b: combinedB,
      confidenceA,
      confidenceB,
      pairConfidence,
      delta,
      status,
      reasons: reasonForSignal(status),
      recommendedAction: actionForSignal(status),
    };
    pairAnswerSignals.push(signal);
    axes.push({
      axis,
      status,
      a: combinedA,
      b: combinedB,
      delta,
      confidence: pairConfidence,
      safeWording: signal.reasons[0] ?? 'По ответам пока нет выраженного сигнала риска.',
    });
  }

  const riskCount = pairAnswerSignals.filter((signal) => signal.status === 'risk').length;
  const enoughCount = pairAnswerSignals.filter((signal) => signal.status !== 'insufficient_data').length;
  const confidence =
    pairAnswerSignals.reduce((sum, signal) => sum + signal.pairConfidence, 0) /
    Math.max(pairAnswerSignals.length, 1);
  const score = clamp01(1 - riskCount / Math.max(enoughCount, 1));
  const overall = {
    score,
    confidence,
    status:
      confidence < DEFAULT_SCORING_CONFIG.lowConfidenceThreshold
        ? 'insufficient_data' as const
        : riskCount > 0
          ? 'risk' as const
          : score > 0.75
            ? 'strong' as const
            : 'neutral' as const,
  };

  return {
    ...traitDiagnostics,
    axes,
    pairAnswerSignals,
    overall,
    generatedInsightIds: [],
  };
};
