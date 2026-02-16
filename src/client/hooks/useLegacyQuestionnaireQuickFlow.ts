import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import type { QuestionDTO } from '@/client/api/types';
import { useApi } from './useApi';

type UseLegacyQuestionnaireQuickFlowOptions = {
  enabled?: boolean;
  limit?: number;
  axis?: string;
};

const toQuestionId = (question: QuestionDTO): string => question.id ?? question._id ?? '';

export function useLegacyQuestionnaireQuickFlow(
  options: UseLegacyQuestionnaireQuickFlowOptions = {}
) {
  const enabled = options.enabled ?? true;
  const limit = options.limit ?? 12;
  const axis = options.axis;

  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, number>>({});

  const loadAbortRef = useRef<AbortController | null>(null);
  const loadVersionRef = useRef(0);

  const {
    runSafe: runLoadSafe,
    loading: loadingQuestions,
    error: loadError,
    clearError: clearLoadError,
  } = useApi('legacy-questionnaire-load');
  const {
    runSafe: runSubmitSafe,
    loading: submitting,
    error: submitError,
    clearError: clearSubmitError,
  } = useApi('legacy-questionnaire-submit');

  const questionIds = useMemo(
    () =>
      questions
        .map(toQuestionId)
        .filter((value): value is string => value.length > 0),
    [questions]
  );

  const canSubmit = useMemo(() => {
    if (questionIds.length === 0) return false;
    return questionIds.every((questionId) => answersByQuestionId[questionId] !== undefined);
  }, [answersByQuestionId, questionIds]);

  const refetchQuestions = useCallback(async (): Promise<QuestionDTO[] | null> => {
    clearLoadError();
    loadVersionRef.current += 1;
    const requestVersion = loadVersionRef.current;

    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;

    const fresh = await runLoadSafe(
      () => questionnairesApi.getRandomQuestions(limit, axis, controller.signal),
      { loadingKey: 'legacy-questionnaire-load' }
    );
    if (!fresh || requestVersion !== loadVersionRef.current) return null;

    const normalized = Array.isArray(fresh) ? fresh : [];
    setQuestions(normalized);
    setAnswersByQuestionId({});
    return normalized;
  }, [axis, clearLoadError, limit, runLoadSafe]);

  useEffect(() => {
    if (!enabled) return;
    void refetchQuestions();
    return () => {
      loadAbortRef.current?.abort();
    };
  }, [enabled, refetchQuestions]);

  const answerQuestion = useCallback((questionId: string, value: number) => {
    setAnswersByQuestionId((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  }, []);

  const submitAnswers = useCallback(async (): Promise<boolean> => {
    if (!canSubmit) return false;
    clearSubmitError();

    const answers = questionIds.map((questionId) => ({
      qid: questionId,
      ui: answersByQuestionId[questionId],
    }));

    const saved = await runSubmitSafe(
      () => questionnairesApi.submitBulkAnswers(answers),
      { loadingKey: 'legacy-questionnaire-submit' }
    );

    return Boolean(saved);
  }, [
    answersByQuestionId,
    canSubmit,
    clearSubmitError,
    questionIds,
    runSubmitSafe,
  ]);

  return {
    questions,
    answersByQuestionId,
    loadingQuestions,
    submitting,
    loadError,
    submitError,
    canSubmit,
    answerQuestion,
    refetchQuestions,
    submitAnswers,
    clearLoadError,
    clearSubmitError,
  };
}
