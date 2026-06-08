'use client';

type QuestionItem = {
  _id?: string;
  id?: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
};

type Props = {
  q: QuestionItem;
  selected?: number;
  onAnswer: (qid: string, val: number) => void;
};

export default function QuestionCard({ q, selected, onAnswer }: Props) {
  const qid = (q.id ?? q._id) ?? '';
  if (!qid) return null;

  const label = q.text?.ru ?? q.text?.en ?? '';

  return (
    <div className="app-panel p-5 sm:p-7">
      <p className="font-display text-xl font-medium leading-snug text-slate-900 sm:text-2xl">{label}</p>

      {q.scale === 'likert5' && (
        <div className="mt-6 grid grid-cols-5 gap-2 sm:gap-3">
          {[1, 2, 3, 4, 5].map((i) => {
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
      )}

      {q.scale === 'bool' && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
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
      )}
    </div>
  );
}
