'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { matchApi } from '@/client/api/match.api';
import { useApi } from '@/client/hooks/useApi';
import BackBar from '@/components/ui/BackBar';
import ErrorView from '@/components/ui/ErrorView';

const MAX = { req: 80, give: 80, question: 120 };

export default function MatchCardCreatePage() {
  const router = useRouter();
  const [requirements, setRequirements] = useState(['', '', '']);
  const [give, setGive] = useState(['', '', '']);
  const [questions, setQuestions] = useState(['', '']);
  const [localError, setLocalError] = useState<string | null>(null);

  const { runSafe, loading, error } = useApi('match-card-create');

  useEffect(() => {
    let active = true;
    runSafe(() => matchApi.getOwnMatchCard(), { loadingKey: 'match-card-create' }).then((card) => {
      if (!active) return;
      if (card?.requirements?.length === 3) {
        router.replace('/search');
      }
    });
    return () => {
      active = false;
    };
  }, [router, runSafe]);

  const bindInput =
    (state: string[], setter: (value: string[]) => void, maxLength: number) =>
    (index: number, value: string) => {
      const next = state.slice();
      next[index] = value.slice(0, maxLength);
      setter(next);
    };

  const setRequirement = bindInput(requirements, setRequirements, MAX.req);
  const setGiveValue = bindInput(give, setGive, MAX.give);
  const setQuestion = bindInput(questions, setQuestions, MAX.question);

  const onSubmit = async () => {
    setLocalError(null);
    const hasEmpty = requirements.some((value) => !value.trim()) ||
      give.some((value) => !value.trim()) ||
      questions.some((value) => !value.trim());

    if (hasEmpty) {
      setLocalError('Заполните все поля.');
      return;
    }

    const saved = await runSafe(
      () =>
        matchApi.saveOwnMatchCard({
          requirements: [requirements[0], requirements[1], requirements[2]],
          give: [give[0], give[1], give[2]],
          questions: [questions[0], questions[1]],
          isActive: true,
        }),
      {
        loadingKey: 'match-card-create',
      }
    );

    if (saved) {
      router.replace('/search');
      return;
    }

    setLocalError('Ошибка сохранения.');
  };

  const counter = (value: string, maxLength: number) => (
    <span className="app-muted text-xs">
      {value.length}/{maxLength}
    </span>
  );

  return (
    <div className="app-shell">
      <main className="space-y-4 pb-4 pt-3 sm:space-y-5 sm:pb-6 sm:pt-4">
        <BackBar title="Карточка мэтчинга" fallbackHref="/main-menu" />
        <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Настройка карточки знакомства</h1>

        {error && <ErrorView error={error} onRetry={onSubmit} />}
        {localError && <p className="text-red-600">{localError}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="app-panel app-lift space-y-2 p-4">
            <h2 className="font-medium">Мои условия (требуют согласия)</h2>
            {requirements.map((value, index) => (
              <div key={index} className="space-y-1">
                <input
                  value={value}
                  onChange={(event) => setRequirement(index, event.target.value)}
                  placeholder={`Условие ${index + 1}`}
                  maxLength={MAX.req}
                  className="w-full rounded border px-3 py-2"
                />
                {counter(value, MAX.req)}
              </div>
            ))}
          </section>

          <section className="app-panel app-lift space-y-2 p-4">
            <h2 className="font-medium">Что я готов(а) дать</h2>
            {give.map((value, index) => (
              <div key={index} className="space-y-1">
                <input
                  value={value}
                  onChange={(event) => setGiveValue(index, event.target.value)}
                  placeholder={`Обещание ${index + 1}`}
                  maxLength={MAX.give}
                  className="w-full rounded border px-3 py-2"
                />
                {counter(value, MAX.give)}
              </div>
            ))}
          </section>
        </div>

        <section className="app-panel app-lift space-y-2 p-4">
          <h2 className="font-medium">Вопросы партнеру</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {questions.map((value, index) => (
              <div key={index} className="space-y-1">
                <input
                  value={value}
                  onChange={(event) => setQuestion(index, event.target.value)}
                  placeholder={`Вопрос ${index + 1}`}
                  maxLength={MAX.question}
                  className="w-full rounded border px-3 py-2"
                />
                {counter(value, MAX.question)}
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-stretch sm:justify-end">
          <button
            onClick={() => void onSubmit()}
            disabled={loading}
            className="app-btn-primary w-full px-4 py-2 text-white disabled:opacity-60 sm:w-auto"
          >
            {loading ? 'Сохраняем...' : 'Сохранить и перейти к поиску'}
          </button>
        </div>
      </main>
    </div>
  );
}
