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
  // Унифицируем идентификатор
  const qid = (q.id ?? q._id) ?? '';
  if (!qid) return null; // если вдруг нет id — ничего не рендерим

  const label = q.text?.ru ?? q.text?.en ?? '';

  return (
    <div className="border border-gray-300 dark:border-gray-600 p-4 rounded-md bg-white dark:bg-gray-800">
      <p className="text-gray-800 dark:text-gray-200">{label}</p>

      {q.scale === 'likert5' && (
        <div className="flex gap-2 mt-2">
          {[1, 2, 3, 4, 5].map((i) => {
            const isSel = selected === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onAnswer(qid, i)}
                className={[
                  'w-8 h-8 flex items-center justify-center border rounded-md transition',
                  isSel
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-400 hover:bg-blue-100 dark:hover:bg-gray-700',
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
        <div className="flex gap-4 mt-2">
          {[
            { val: 1 as const, label: 'Нет' },
            { val: 2 as const, label: 'Да'  },
          ].map(({ val, label: btnLabel }) => {
            const isSel = selected === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => onAnswer(qid, val)}
                className={[
                  'px-4 py-1 border rounded-md transition',
                  isSel
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-400 hover:bg-green-100 dark:hover:bg-gray-700',
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
