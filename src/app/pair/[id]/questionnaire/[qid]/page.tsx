'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BackBar from '@/components/ui/BackBar';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import { pairsApi } from '@/client/api/pairs.api';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import type { QuestionDTO } from '@/client/api/types';
import { useApi } from '@/client/hooks/useApi';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';

export default function PairQuestionnaireRunner() {
  const params = useParams<{ id: string; qid: string }>();
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const pairId = params?.id;
  const questionnaireId = params?.qid;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionDTO[]>([]);
  const [title, setTitle] = useState<string>('');
  const [index, setIndex] = useState(0);
  const [by, setBy] = useState<'A' | 'B'>('A');

  const {
    runSafe: runLoadSafe,
    loading: loading,
    error: loadError,
    clearError: clearLoadError,
  } = useApi('pair-questionnaire-load');
  const {
    runSafe: runSubmitSafe,
    loading: submitting,
    error: submitError,
    clearError: clearSubmitError,
  } = useApi('pair-questionnaire-submit');

  useEffect(() => {
    let active = true;
    if (!pairId || !currentUser) return;

    pairsApi
      .getSummary(pairId)
      .then((summary) => {
        if (!active) return;
        const members = summary.pair.members ?? [];
        setBy(members[0] === currentUser.id ? 'A' : 'B');
      })
      .catch(() => {
        if (!active) return;
        setBy('A');
      });

    return () => {
      active = false;
    };
  }, [currentUser, pairId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    if (!questionnaireId) return;

    setIndex(0);
    setQuestions([]);
    setTitle('');
    clearLoadError();

    runLoadSafe(
      () => questionnairesApi.getQuestionnaire(questionnaireId, controller.signal),
      { loadingKey: 'pair-questionnaire-load' }
    ).then((questionnaire) => {
      if (!active || !questionnaire) return;
      setTitle(questionnaire.title?.ru ?? questionnaire.title?.en ?? 'Анкета');
      setQuestions(Array.isArray(questionnaire.questions) ? questionnaire.questions : []);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [clearLoadError, questionnaireId, runLoadSafe]);

  useEffect(() => {
    let active = true;
    if (!pairId || !questionnaireId) return;

    questionnairesApi
      .startCoupleQuestionnaire(pairId, questionnaireId)
      .then((response) => {
        if (!active) return;
        setSessionId(response.sessionId ?? null);
      })
      .catch(() => {
        if (!active) return;
        setSessionId(null);
      });

    return () => {
      active = false;
    };
  }, [pairId, questionnaireId]);

  const currentQuestion = questions[index];
  const questionText = currentQuestion?.text?.ru ?? currentQuestion?.text?.en ?? '';
  const scale = currentQuestion?.scale ?? 'likert5';

  const totalQuestions = useMemo(() => questions.length || 1, [questions.length]);

  const submitAnswer = async (ui: number) => {
    if (!pairId || !questionnaireId || !currentQuestion) return;

    const questionId = currentQuestion.id ?? currentQuestion._id;
    if (!questionId) return;

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

    router.push(`/pair/${pairId}/diagnostics`);
  };

  if (!pairId || !questionnaireId) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <EmptyStateView title="Анкета недоступна" description="Проверьте ссылку и попробуйте снова." />
      </main>
    );
  }

  if (loading && questions.length === 0) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <BackBar title="Анкета пары" fallbackHref={`/pair/${pairId}/diagnostics`} />
        <LoadingView compact label="Загрузка анкеты..." />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <BackBar title="Анкета пары" fallbackHref={`/pair/${pairId}/diagnostics`} />
        <ErrorView
          error={loadError}
          onRetry={() => {
            router.refresh();
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
        <BackBar title={title || 'Анкета пары'} fallbackHref={`/pair/${pairId}/diagnostics`} />
        <EmptyStateView
          title="Вопросы не найдены"
          description="Попробуйте открыть анкету позже."
        />
      </main>
    );
  }

  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4">
      <BackBar title={title || 'Анкета пары'} fallbackHref={`/pair/${pairId}/diagnostics`} />

      <div className="app-muted text-sm">
        Ваша роль в паре: <span className="font-medium">{by}</span>
      </div>

      <div className="app-panel space-y-3 p-4">
        <div className="text-sm text-gray-500">
          Вопрос {index + 1} / {totalQuestions}
        </div>
        <div className="text-lg text-slate-900">{questionText}</div>

        {scale === 'bool' ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void submitAnswer(1);
              }}
              disabled={submitting}
              className="app-btn-secondary px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
            >
              Да
            </button>
            <button
              type="button"
              onClick={() => {
                void submitAnswer(2);
              }}
              disabled={submitting}
              className="app-btn-secondary px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
            >
              Нет
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  void submitAnswer(value);
                }}
                disabled={submitting}
                className="app-btn-secondary px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
              >
                {value}
              </button>
            ))}
          </div>
        )}
      </div>

      {submitError && (
        <ErrorView
          error={submitError}
          onAuthRequired={() => {
            router.push('/');
          }}
        />
      )}
    </main>
  );
}
