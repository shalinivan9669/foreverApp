'use client';

type Props = {
  q: { 
    _id: string;
    text: Record<string, string>;
    scale: 'likert5' | 'bool';
  };
  selected?: number;                       // ← новое
  onAnswer: (qid: string, val: number) => void;
};

export default function QuestionCard({ q, selected, onAnswer }: Props) {
  return (
    <div className="border border-gray-300 dark:border-gray-600 p-4 rounded-md bg-white dark:bg-gray-800">
      <p className="text-gray-800 dark:text-gray-200">{q.text.ru}</p>

      {q.scale === 'likert5' && (
        <div className="flex gap-2 mt-2">
          {[1, 2, 3, 4, 5].map(i => {
            const isSel = selected === i;
            return (
              <button
                key={i}
                onClick={() => onAnswer(q._id, i)}
                className={`
                  w-8 h-8 flex items-center justify-center border rounded-md transition
                  ${isSel
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-400 hover:bg-blue-100 dark:hover:bg-gray-700'}
                  focus:outline-none focus:ring-2 focus:ring-blue-400
                `}
              >
                {i}
              </button>
            );
          })}
        </div>
      )}

      {q.scale === 'bool' && (
        <div className="flex gap-4 mt-2">
          {[{ val: 1, label: 'Нет' }, { val: 2, label: 'Да' }].map(({ val, label }) => {
            const isSel = selected === val;
            return (
              <button
                key={val}
                onClick={() => onAnswer(q._id, val)}
                className={`
                  px-4 py-1 border rounded-md transition
                  ${isSel
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-transparent text-gray-700 dark:text-gray-300 border-gray-400 hover:bg-green-100 dark:hover:bg-gray-700'}
                  focus:outline-none focus:ring-2 focus:ring-green-400
                `}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
