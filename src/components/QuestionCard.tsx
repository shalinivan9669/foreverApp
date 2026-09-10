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
  disabled?: boolean;
  onAnswer: (qid: string, val: number) => void;
};

export default function QuestionCard({ q, selected, disabled = false, onAnswer }: Props) {
  const qid = q.id;
  const questionId = useId();
  const scaleHelpId = useId();

  const label = q.text?.ru ?? q.text?.en ?? '';

  return (
    <section className="app-question-card" aria-labelledby={questionId} aria-busy={disabled}>
      <h2 id={questionId} className="app-question-title">{label}</h2>

      {q.scale === 'likert5' && (
        <fieldset className="app-question-options" aria-describedby={scaleHelpId} disabled={disabled}>
          <legend className="sr-only">Выберите один вариант</legend>
          <div className="app-question-scale">
          {Array.from({ length: q.optionCount }, (_, index) => index + 1).map((i) => {
            const isSel = selected === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onAnswer(qid, i)}
                className="app-question-key"
                aria-pressed={isSel}
                aria-label={`Оценка ${i}`}
              >
                {i}
              </button>
            );
          })}
          </div>
          <p id={scaleHelpId} className="app-question-help">
            1 — совсем нет, средний вариант — нейтрально, {q.optionCount} — полностью да.
          </p>
        </fieldset>
      )}

      {q.scale === 'bool' && (
        <fieldset className="app-question-options" disabled={disabled}>
          <legend className="sr-only">Выберите да или нет</legend>
          <div className="app-question-binary">
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
                className="app-question-key app-question-key-binary"
                aria-pressed={isSel}
              >
                <span>{btnLabel}</span>
                <span className="app-question-choice-mark" aria-hidden="true">{isSel ? '✓' : ''}</span>
              </button>
            );
          })}
          </div>
        </fieldset>
      )}
    </section>
  );
}
