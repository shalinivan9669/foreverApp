  'use client';

  import { useEffect, useMemo, useState } from 'react';
  import QuestionnaireCard from '@/components/QuestionnaireCard';
  import type { QuestionnaireType } from '@/models/Questionnaire';
  import BackBar from '@/components/ui/BackBar';

  type Axis =
    | 'communication'
    | 'domestic'
    | 'personalViews'
    | 'finance'
    | 'sexuality'
    | 'psyche';

  export default function QuestionnairesPage() {
    const [list, setList] = useState<QuestionnaireType[]>([]);
    const [axis, setAxis] = useState<Axis | 'all'>('all');
    const [aud, setAud]   = useState<'all' | 'individual' | 'couple'>('all');

    useEffect(() => {
      fetch('/api/questionnaires')
        .then((r) => r.json())
        .then(setList);
    }, []);

    const filtered = useMemo(() => {
      return list.filter((q) => {
        if (axis !== 'all' && q.axis !== axis) return false;
        if (aud !== 'all' && q.target?.type !== aud) return false;
        return true;
      });
    }, [list, axis, aud]);

    return (
      <div className="p-4 max-w-5xl mx-auto">
          <BackBar title="Анкетирование" fallbackHref="/main-menu" />
        <h1 className="text-xl font-semibold mb-4">Анкетирование</h1>

        {/* Фильтры */}
        <div className="flex gap-3 items-center mb-4">
          <label className="flex items-center gap-2">
            Ось:
            <select
              value={axis}
              onChange={(e) => setAxis(e.target.value as Axis | 'all')}
              className="border rounded px-2 py-1"
            >
              <option value="all">Все</option>
              <option value="communication">Коммуникация</option>
              <option value="domestic">Быт</option>
              <option value="personalViews">Взгляды</option>
              <option value="finance">Финансы</option>
              <option value="sexuality">Интим</option>
              <option value="psyche">Психика</option>
            </select>
          </label>

          <label className="flex items-center gap-2">
            Тип:
            <select
              value={aud}
              onChange={(e) => setAud(e.target.value as 'all'|'individual'|'couple')}
              className="border rounded px-2 py-1"
            >
              <option value="all">Все</option>
              <option value="individual">Индивидуальные</option>
              <option value="couple">Для пары</option>
            </select>
          </label>
        </div>

        {/* Список карточек */}
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((q) => (
            <QuestionnaireCard
              key={q._id}
              q={{
                _id: q._id,
                title: q.title,
                description: q.description,
                axis: q.axis,
                target: q.target,
                difficulty: q.difficulty,
                tags: q.tags,
              }}
            />
          ))}
        </div>

        {!filtered.length && (
          <p className="text-sm text-gray-600 mt-6">
            По текущим фильтрам анкет нет.
          </p>
        )}
      </div>
    );
  }
