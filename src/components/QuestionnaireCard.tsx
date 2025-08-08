'use client';

type Scale = 'likert5' | 'bool';

type QCardQ = {
  id?: string;                 // новый формат (в сабдокументах)
  _id?: string;                // старый формат (коллекция questions)
  text: Record<string, string>;
  scale: Scale;
};

interface Props {
  q: QCardQ;
  selected?: number;
  onAnswer: (qid: string, ui: number) => void; // ui = 1..N
}

export default function QuestionCard({ q, selected, onAnswer }: Props) {
  // Унифицируем идентификатор вопроса
  const qid = q._id ?? q.id ?? '';

  // Для нашего бекенда ui должен быть 1..N (а не 0..N-1), чтобы попадать в q.map[ui-1]
  const options = q.scale === 'likert5' ? [1, 2, 3, 4, 5] : [1, 2];

  const label = (ui: number) =>
    q.scale === 'bool' ? (ui === 1 ? 'Нет' : 'Да') : String(ui);

  return (
    <div className="border rounded p-4">
      <p className="mb-3">{q.text?.ru ?? q.text?.en ?? ''}</p>

      <div className="flex gap-2">
        {options.map((ui) => (
          <button
            key={ui}
            onClick={() => onAnswer(qid, ui)}
            className={
              'px-3 py-1 rounded ' +
              (selected === ui ? 'bg-blue-600 text-white' : 'bg-gray-100')
            }
          >
            {label(ui)}
          </button>
        ))}
      </div>
    </div>
  );
}
