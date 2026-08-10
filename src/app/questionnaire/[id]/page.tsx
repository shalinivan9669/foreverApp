'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BackBar from '@/components/ui/BackBar';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import QuestionCard from '@/components/QuestionCard';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import { usersApi } from '@/client/api/users.api';
import type { QuestionnaireDTO } from '@/client/api/types';
import { useApi } from '@/client/hooks/useApi';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';

type RenderableQuestion = {
  id?: string;
  _id?: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
};

export default function PersonalQuestionnaireRunner() {
  const { id } = useParams<{ id: string }>();

  return <PersonalQuestionnaireRunnerContent key={id ?? ''} id={id} />;
}

function PersonalQuestionnaireRunnerContent({ id }: { id?: string }) {
  const router = useRouter();

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireDTO | null>(null);
  const [index, setIndex] = useState(0);
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<string, number>>({});
  const { refetch: refetchCurrentUser } = useCurrentUser({ enabled: false });

  const {
    runSafe: runLoadSafe,
    loading: loadingQuestionnaire,
    error: loadError,
  } = useApi('questionnaire-personal-load');

  const {
    runSafe: runSubmitSafe,
    loading: submitting,
    error: submitError,
    clearError: clearSubmitError,
  } = useApi('questionnaire-personal-submit');

  useEffect(() => {
    if (!id) return;

    let active = true;
    const controller = new AbortController();

    runLoadSafe(() => questionnairesApi.startPersonalQuestionnaire(id, controller.signal), {
      loadingKey: 'questionnaire-personal-load',
    }).then((data) => {
      if (!active || !data) return;
      setQuestionnaire(data);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, runLoadSafe]);

  const questions = useMemo<RenderableQuestion[]>(() => {
    if (!questionnaire || !Array.isArray(questionnaire.questions)) return [];
    return questionnaire.questions;
  }, [questionnaire]);

  const currentQuestion = questions[index];
  const title = questionnaire?.title?.ru ?? questionnaire?.title?.en ?? 'Анкета';

  const onAnswer = async (questionId: string, ui: number) => {
    if (!id || !currentQuestion || submitting) return;

    const normalizedQuestionId = currentQuestion.id ?? currentQuestion._id ?? questionId;
    if (!normalizedQuestionId) return;
    const nextAnswersByQuestionId = {
      ...answersByQuestionId,
      [normalizedQuestionId]: ui,
    };
    setAnswersByQuestionId(nextAnswersByQuestionId);

    clearSubmitError();

    if (index < questions.length - 1) {
      setIndex((prev) => prev + 1);
      return;
    }

    const answers = Object.entries(nextAnswersByQuestionId).map(([qid, answerUi]) => ({
      qid,
      ui: answerUi,
    }));

    const saved = await runSubmitSafe(
      () => questionnairesApi.submitPersonalAnswers(id, answers),
      { loadingKey: 'questionnaire-personal-submit' }
    );

    if (!saved) return;

    await refetchCurrentUser();
    await usersApi.getProfileSummary().catch(() => null);
    router.push('/questionnaires');
  };

  if (loadingQuestionnaire && !questionnaire) {
    return (
      <div className="app-shell-compact app-page-stack py-3 sm:py-5">
        <BackBar title="Анкета" fallbackHref="/questionnaires" />
        <LoadingView compact label="Загрузка анкеты..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-shell-compact app-page-stack py-3 sm:py-5">
        <BackBar title="Анкета" fallbackHref="/questionnaires" />
        <ErrorView
          error={loadError}
          onRetry={() => {
            router.refresh();
          }}
          onAuthRequired={() => {
            router.push('/');
          }}
        />
      </div>
    );
  }

  if (!questionnaire || !currentQuestion) {
    return (
      <div className="app-shell-compact app-page-stack py-3 sm:py-5">
        <BackBar title="Анкета" fallbackHref="/questionnaires" />
        <p className="text-sm text-gray-600">Анкета недоступна.</p>
      </div>
    );
  }

  if (questionnaire.scope === 'couple') {
    return (
      <div className="app-shell-compact app-page-stack py-3 sm:py-5">
        <BackBar title={title} fallbackHref="/questionnaires" />
        <p className="text-sm text-amber-700">
          Эта анкета относится к парному сценарию. Откройте её из раздела пары.
        </p>
      </div>
    );
  }

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title={title} fallbackHref="/questionnaires" />

      <div>
        <h1 className="app-page-title font-semibold">{title}</h1>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="app-muted">Вопрос {index + 1} из {questions.length}</span>
          <span className="font-semibold">{Math.round(((index + 1) / questions.length) * 100)}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-[var(--app-primary)] transition-[width]"
            style={{ width: `${((index + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <QuestionCard q={currentQuestion} onAnswer={onAnswer} />

      {submitting && <LoadingView compact label="Сохраняем ответ..." />}
      <ErrorView
        error={submitError}
        onAuthRequired={() => {
          router.push('/');
        }}
      />
    </main>
  );
}
