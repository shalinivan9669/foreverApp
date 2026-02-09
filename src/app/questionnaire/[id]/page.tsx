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
  const router = useRouter();

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireDTO | null>(null);
  const [index, setIndex] = useState(0);
  const { refetch: refetchCurrentUser } = useCurrentUser({ enabled: false });

  const {
    runSafe: runLoadSafe,
    loading: loadingQuestionnaire,
    error: loadError,
    clearError: clearLoadError,
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

    setIndex(0);
    setQuestionnaire(null);
    clearLoadError();

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
  }, [clearLoadError, id, runLoadSafe]);

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

    clearSubmitError();

    const saved = await runSubmitSafe(
      () => questionnairesApi.submitPersonalAnswer(id, { qid: normalizedQuestionId, ui }),
      { loadingKey: 'questionnaire-personal-submit' }
    );

    if (!saved) return;

    if (index < questions.length - 1) {
      setIndex((prev) => prev + 1);
      return;
    }

    await refetchCurrentUser();
    await usersApi.getProfileSummary().catch(() => null);
    router.push('/questionnaires');
  };

  if (loadingQuestionnaire && !questionnaire) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-4">
        <BackBar title="Анкета" fallbackHref="/questionnaires" />
        <LoadingView compact label="Загрузка анкеты..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-4">
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
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-4">
        <BackBar title="Анкета" fallbackHref="/questionnaires" />
        <p className="text-sm text-gray-600">Анкета недоступна.</p>
      </div>
    );
  }

  if (questionnaire.scope === 'couple') {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-4">
        <BackBar title={title} fallbackHref="/questionnaires" />
        <p className="text-sm text-amber-700">
          Эта анкета относится к парному сценарию. Откройте её из раздела пары.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-4">
      <BackBar title={title} fallbackHref="/questionnaires" />

      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-gray-600">
        {index + 1}/{questions.length}
      </p>

      <QuestionCard q={currentQuestion} onAnswer={onAnswer} />

      {submitting && <LoadingView compact label="Сохраняем ответ..." />}
      <ErrorView
        error={submitError}
        onAuthRequired={() => {
          router.push('/');
        }}
      />
    </div>
  );
}
