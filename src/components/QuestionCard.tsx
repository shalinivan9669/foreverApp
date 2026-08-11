'use client';

import { useId } from 'react';

type QuestionItem = {
  id: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
  optionCount: number;
};

type Props = {
  q: QuestionItem;
  selected?: number;
  onAnswer: (qid: string, val: number) => void;
};

export default function QuestionCard({ q, selected, onAnswer }: Props) {
  const qid = q.id;
  const questionId = useId();
  const scaleHelpId = useId();

  const label = q.text?.ru ?? q.text?.en ?? '';

  return (
    <section className="app-panel p-5 sm:p-7" aria-labelledby={questionId}>
      <h2 id={questionId} className="font-display text-xl font-medium leading-snug text-slate-900 sm:text-2xl">{label}</h2>

      {q.scale === 'likert5' && (
        <fieldset className="mt-6" aria-describedby={scaleHelpId}>
          <legend className="sr-only">Выберите один вариант</legend>
          <div className="grid grid-cols-5 gap-2 sm:gap-3">
          {Array.from({ length: q.optionCount }, (_, index) => index + 1).map((i) => {
            const isSel = selected === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onAnswer(qid, i)}
                className={[
                  'flex min-h-12 items-center justify-center rounded-lg border text-base font-semibold transition sm:min-h-14',
                  isSel
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-400 bg-transparent text-slate-700 hover:bg-blue-100',
                  'focus:outline-none focus:ring-2 focus:ring-blue-400',
                ].join(' ')}
                aria-pressed={isSel}
                aria-label={`Оценка ${i}`}
              >
                {i}
              </button>
            );
          })}
          </div>
          <p id={scaleHelpId} className="app-muted mt-3 text-xs">
            1 — совсем нет, средний вариант — нейтрально, {q.optionCount} — полностью да.
          </p>
        </fieldset>
      )}

      {q.scale === 'bool' && (
        <fieldset className="mt-6">
          <legend className="sr-only">Выберите да или нет</legend>
          <div className="grid gap-3 sm:grid-cols-2">
          {[
            { val: 1 as const, label: 'Нет' },
            { val: 2 as const, label: 'Да' },
          ].map(({ val, label: btnLabel }) => {
            const isSel = selected === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onAnswer(qid, val)}
                className={[
                  'min-h-12 rounded-lg border px-4 py-3 text-center font-semibold transition',
                  isSel
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-gray-400 bg-transparent text-slate-700 hover:bg-green-100',
                  'focus:outline-none focus:ring-2 focus:ring-green-400',
                ].join(' ')}
                aria-pressed={isSel}
              >
                {btnLabel}
              </button>
            );
          })}
          </div>
        </fieldset>
      )}
    </section>
  );
}
