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
  // Р Р€Р Р…Р С‘РЎвЂћР С‘РЎвЂ Р С‘РЎР‚РЎС“Р ВµР С Р С‘Р Т‘Р ВµР Р…РЎвЂљР С‘РЎвЂћР С‘Р С”Р В°РЎвЂљР С•РЎР‚
  const qid = (q.id ?? q._id) ?? '';
  if (!qid) return null; // Р ВµРЎРѓР В»Р С‘ Р Р†Р Т‘РЎР‚РЎС“Р С– Р Р…Р ВµРЎвЂљ id РІР‚вЂќ Р Р…Р С‘РЎвЂЎР ВµР С–Р С• Р Р…Р Вµ РЎР‚Р ВµР Р…Р Т‘Р ВµРЎР‚Р С‘Р С

  const label = q.text?.ru ?? q.text?.en ?? '';

  return (
    <div className="app-panel p-4">
      <p className="text-slate-900">{label}</p>

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
                    : 'bg-transparent text-slate-700 border-gray-400 hover:bg-blue-100',
                  'focus:outline-none focus:ring-2 focus:ring-blue-400',
                ].join(' ')}
                aria-pressed={isSel}
                aria-label={`Р С›РЎвЂ Р ВµР Р…Р С”Р В° ${i}`}
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
            { val: 1 as const, label: 'Р СњР ВµРЎвЂљ' },
            { val: 2 as const, label: 'Р вЂќР В°'  },
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
                    : 'bg-transparent text-slate-700 border-gray-400 hover:bg-green-100',
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

