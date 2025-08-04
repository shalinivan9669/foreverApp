import Link from 'next/link';
import type { QuestionnaireType } from '@/models/Questionnaire';

export default function QuestionnaireCard({ q }: { q: QuestionnaireType }) {
  return (
    <Link href={`/questionnaire/${q._id}`}
      className="border p-4 rounded hover:bg-gray-50 flex flex-col gap-2">
      <h3 className="font-semibold">{q.title}</h3>
      <p className="text-sm text-gray-600">{q.description ?? ''}</p>
      <div className="text-xs mt-auto">
        {q.length} вопросов · {q.axis}
        {q.audience === 'pair' && ' · для пары'}
      </div>
    </Link>
  );
}
