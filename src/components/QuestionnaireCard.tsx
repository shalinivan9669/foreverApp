'use client';

import Link from 'next/link';
import type { QuestionnaireType } from '@/models/Questionnaire';

// Берём только то, что нужно карточке
type CardData = Pick<
  QuestionnaireType,
  '_id' | 'title' | 'description' | 'axis' | 'target' | 'difficulty' | 'tags'
>;

export default function QuestionnaireCard({ q }: { q: CardData }) {
  const title = q.title?.ru ?? q.title?.en ?? q._id;
  const desc  = q.description?.ru ?? q.description?.en ?? '';

  const axisLabel: Record<string, string> = {
    communication: 'Коммуникация',
    domestic: 'Быт',
    personalViews: 'Взгляды',
    finance: 'Финансы',
    sexuality: 'Интим',
    psyche: 'Психика',
  };

  return (
    <div className="border rounded p-4 bg-white dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {desc && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{desc}</p>}
        </div>

        {/* бейджи */}
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
            {axisLabel[q.axis] ?? q.axis}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
            {q.target.type === 'couple' ? 'Для пары' : q.target.gender === 'unisex' ? 'Унисекс' : q.target.gender === 'male' ? 'Для мужчин' : 'Для женщин'}
          </span>
          {q.difficulty ? (
            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
              Сложность: {q.difficulty}
            </span>
          ) : null}
        </div>
      </div>

      {q.tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {q.tags.map((t) => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4">
        <Link
          href={`/questionnaire/${q._id}`}
          className="inline-block bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
        >
          Пройти
        </Link>
      </div>
    </div>
  );
}
