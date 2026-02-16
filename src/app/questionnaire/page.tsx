'use client';

import { useRouter } from 'next/navigation';
import QuestionCard from '@/components/QuestionCard';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import { useLegacyQuestionnaireQuickFlow } from '@/client/hooks/useLegacyQuestionnaireQuickFlow';
import { useUserStore } from '@/store/useUserStore';

export default function QuestionnairePage() {
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const {
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
  } = useLegacyQuestionnaireQuickFlow({
    enabled: true,
    limit: 12,
  });

  const onSubmit = async () => {
    if (!user) return;
    const saved = await submitAnswers();
    if (!saved) return;
    router.push('/main-menu');
  };

  if (!user) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <EmptyStateView
          title="Пользователь не найден"
          description="Перезапустите авторизацию и попробуйте снова."
        />
      </main>
    );
  }

  if (loadingQuestions && questions.length === 0) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <LoadingView label="Загружаем вопросы..." />
      </main>
    );
  }

  if (loadError && questions.length === 0) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <ErrorView error={loadError} onRetry={() => void refetchQuestions()} />
      </main>
    );
  }

  if (!loadingQuestions && questions.length === 0) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <EmptyStateView
          title="Вопросы не найдены"
          description="Попробуйте обновить страницу позже."
        />
      </main>
    );
  }

  return (
    <main className="app-shell-compact space-y-3 py-3 sm:py-4">
      {submitError && (
        <ErrorView
          error={submitError}
          onRetry={() => {
            void onSubmit();
          }}
          onAuthRequired={() => {
            router.push('/');
          }}
        />
      )}

      <div className="space-y-3">
        {questions.map((question) => {
          const questionId = question.id ?? question._id;
          if (!questionId) return null;

          return (
            <QuestionCard
              key={questionId}
              q={question}
              selected={answersByQuestionId[questionId]}
              onAnswer={answerQuestion}
            />
          );
        })}
      </div>

      <button
        type="button"
        disabled={submitting || !canSubmit}
        onClick={() => {
          void onSubmit();
        }}
        className="app-btn-primary w-full px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Сохраняем...' : 'Сохранить'}
      </button>
    </main>
  );
}
