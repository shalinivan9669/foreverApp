'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BackBar from '@/components/ui/BackBar';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import QuestionCard from '@/components/QuestionCard';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import type { QuestionDTO } from '@/client/api/types';
import { useApi } from '@/client/hooks/useApi';

export default function PairQuestionnaireRunner() {
  const params = useParams<{ id: string; qid: string }>();
  const pairId = params?.id;
  const questionnaireId = params?.qid;

  return (
    <PairQuestionnaireRunnerContent
      key={`${pairId ?? ''}:${questionnaireId ?? ''}`}
      pairId={pairId}
      questionnaireId={questionnaireId}
    />
  );
}

function PairQuestionnaireRunnerContent({
  pairId,
  questionnaireId,
}: {
  pairId?: string;
  questionnaireId?: string;
}) {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [title, setTitle] = useState<string>('');
  const [index, setIndex] = useState(0);
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, number>>({});
  const [loadSettled, setLoadSettled] = useState(false);
  const [sessionSettled, setSessionSettled] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const questionRegionRef = useRef<HTMLDivElement | null>(null);

  const {
    runSafe: runLoadSafe,
    loading: loading,
    error: loadError,
  } = useApi('pair-questionnaire-load');
  const {
    runSafe: runStartSafe,
    loading: starting,
    error: startError,
  } = useApi('pair-questionnaire-start');
  const {
    runSafe: runSubmitSafe,
    loading: submitting,
    error: submitError,
    clearError: clearSubmitError,
  } = useApi('pair-questionnaire-submit');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (!questionnaireId) return;

    void runLoadSafe(
      () => questionnairesApi.getQuestionnaire(questionnaireId, controller.signal),
      { loadingKey: 'pair-questionnaire-load' }
    )
      .then((questionnaire) => {
        if (!active || !questionnaire) return;
        setTitle(questionnaire.title?.ru ?? questionnaire.title?.en ?? 'Анкета');
        setQuestions(Array.isArray(questionnaire.questions) ? questionnaire.questions : []);
      })
      .finally(() => {
        if (active) setLoadSettled(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [loadAttempt, questionnaireId, runLoadSafe]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (!pairId || !questionnaireId) return;

    void runStartSafe(
      () => questionnairesApi.startCoupleQuestionnaire(pairId, questionnaireId, controller.signal),
      { loadingKey: 'pair-questionnaire-start' }
    )
      .then((response) => {
        if (!active || !response) return;
        setSessionId(response.sessionId);
      })
      .finally(() => {
        if (active) setSessionSettled(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [pairId, questionnaireId, runStartSafe, sessionAttempt]);

  const currentQuestion = questions[index];
  const totalQuestions = useMemo(() => questions.length || 1, [questions.length]);

  useEffect(() => {
    if (currentQuestion && sessionId) questionRegionRef.current?.focus();
  }, [currentQuestion, index, sessionId]);

  const submitAnswer = async (ui: number) => {
    if (!pairId || !questionnaireId || !currentQuestion) return;

    const questionId = currentQuestion.id;
    setAnswersByQuestionId((current) => ({ ...current, [questionId]: ui }));

    clearSubmitError();
    const saved = await runSubmitSafe(
      () =>
        questionnairesApi.submitCoupleAnswer(pairId, questionnaireId, {
          sessionId,
          questionId,
          ui,
        }),
      { loadingKey: 'pair-questionnaire-submit' }
    );

    if (!saved) return;
    if (index < questions.length - 1) {
      setIndex((value) => value + 1);
      return;
    }

    router.push(`/pair/${pairId}`);
  };

  if (!pairId || !questionnaireId) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <EmptyStateView title="Анкета недоступна" description="Проверьте ссылку и попробуйте снова." />
      </main>
    );
  }

  if ((loading || starting || !loadSettled || !sessionSettled) && (questions.length === 0 || !sessionId)) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <BackBar title="Анкета пары" fallbackHref={`/pair/${pairId}`} />
        <LoadingView compact label="Загрузка анкеты..." />
      </main>
    );
  }

  if (loadError || startError) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <BackBar title="Анкета пары" fallbackHref={`/pair/${pairId}`} />
        <ErrorView
          error={loadError ?? startError}
          onRetry={() => {
            if (loadError) {
              setQuestions([]);
              setLoadSettled(false);
              setLoadAttempt((attempt) => attempt + 1);
            }
            if (startError) {
              setSessionId(null);
              setSessionSettled(false);
              setSessionAttempt((attempt) => attempt + 1);
            }
          }}
          onAuthRequired={() => {
            router.push('/');
          }}
        />
      </main>
    );
  }

  if (!currentQuestion) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <BackBar title={title || 'Анкета пары'} fallbackHref={`/pair/${pairId}`} />
        <EmptyStateView
          title="Вопросы не найдены"
          description="Попробуйте открыть анкету позже."
        />
      </main>
    );
  }

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title={title || 'Анкета пары'} fallbackHref={`/pair/${pairId}`} />

      <div className="app-panel-soft p-3 text-sm">
        Ответ сохраняется от вашего аккаунта. Партнёр не увидит выбранный вариант напрямую.
      </div>

      <div>
        <div className="app-muted mb-3 text-sm">
          Вопрос {index + 1} / {totalQuestions}
        </div>
        <div ref={questionRegionRef} tabIndex={-1} className={submitting ? 'pointer-events-none opacity-70 outline-none' : 'outline-none'}>
          <QuestionCard
            q={currentQuestion}
            selected={answersByQuestionId[currentQuestion.id]}
            onAnswer={(_, value) => void submitAnswer(value)}
          />
        </div>
      </div>

      {submitError && (
        <ErrorView
          error={submitError}
          onRetry={() => {
            const selected = answersByQuestionId[currentQuestion.id];
            if (typeof selected === 'number') void submitAnswer(selected);
          }}
          onAuthRequired={() => {
            router.push('/');
          }}
        />
      )}
    </main>
  );
}
