'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import BackBar from '@/components/ui/BackBar';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import QuestionCard from '@/components/QuestionCard';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import type { QuestionnaireDTO } from '@/client/api/types';
import { useApi } from '@/client/hooks/useApi';

type RenderableQuestion = {
  id: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
  optionCount: number;
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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadSettled, setLoadSettled] = useState(false);
  const questionRegionRef = useRef<HTMLDivElement | null>(null);

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

    void runLoadSafe(() => questionnairesApi.startPersonalQuestionnaire(id, controller.signal), {
      loadingKey: 'questionnaire-personal-load',
    })
      .then((data) => {
        if (!active || !data) return;
        setQuestionnaire(data);
      })
      .finally(() => {
        if (active) setLoadSettled(true);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [id, loadAttempt, runLoadSafe]);

  const questions = useMemo<RenderableQuestion[]>(() => {
    if (!questionnaire || !Array.isArray(questionnaire.questions)) return [];
    return questionnaire.questions;
  }, [questionnaire]);

  const currentQuestion = questions[index];
  const title = questionnaire?.title?.ru ?? questionnaire?.title?.en ?? 'Анкета';

  useEffect(() => {
    if (currentQuestion) questionRegionRef.current?.focus();
  }, [currentQuestion, index]);

  const onAnswer = async (questionId: string, ui: number) => {
    if (!id || !currentQuestion || submitting) return;

    const normalizedQuestionId = currentQuestion.id || questionId;
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

    setLoadAttempt((attempt) => attempt + 1);
  };

  if ((loadingQuestionnaire || !loadSettled) && !questionnaire) {
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
            setQuestionnaire(null);
            setLoadSettled(false);
            setLoadAttempt((attempt) => attempt + 1);
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

  if (questionnaire.ownSubmission) return <main className="app-shell-compact app-page-stack py-4"><BackBar title={title} fallbackHref="/questionnaires" /><h1 className="text-xl font-semibold">Пройден: результат сохранён</h1><p>Ответы закрыты для повторной сдачи. Эта анкета — личная саморефлексия; измерительные характеристики доступны в отдельном каталоге.</p>{questionnaire.ownSubmission.version === questionnaire.version ? questionnaire.ownSubmission.answers.map((answer) => <p key={answer.questionId}>{questions.find((question) => question.id === answer.questionId)?.text.ru ?? answer.questionId}: вариант {answer.ui}</p>) : <p>Сохранена другая редакция. Её текст недоступен; новые формулировки не применяются к вашим прежним ответам.</p>}<Link href="/measurements" className="app-btn-primary">Измерительные анкеты</Link></main>;

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title={title} fallbackHref="/questionnaires" />

      <div>
        <h1 className="app-page-title font-semibold">{title}</h1>
        <p className="app-muted mt-2">Личная саморефлексия. Последний ответ окончательно сохранит анкету и закроет повторное прохождение.</p>
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

      <div ref={questionRegionRef} tabIndex={-1} className="outline-none">
        <QuestionCard
          q={currentQuestion}
          selected={answersByQuestionId[currentQuestion.id]}
          onAnswer={onAnswer}
        />
      </div>

      {submitting && <LoadingView compact label="Сохраняем ответ..." />}
      <ErrorView
        error={submitError}
        onRetry={() => {
          const selected = answersByQuestionId[currentQuestion.id];
          if (typeof selected === 'number') void onAnswer(currentQuestion.id, selected);
        }}
        onAuthRequired={() => {
          router.push('/');
        }}
      />
    </main>
  );
}
