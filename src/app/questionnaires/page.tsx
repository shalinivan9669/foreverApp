'use client';
import { useEffect, useState } from 'react';
import QuestionnaireCard from '@/components/QuestionnaireCard';
import type { QuestionnaireType } from '@/models/Questionnaire';

export default function QuestionnairesPage() {
  const [list, setList] = useState<QuestionnaireType[]>([]);
  const [axis, setAxis] = useState<string>('all');

  useEffect(() => {
    fetch('/api/questionnaires').then(r=>r.json()).then(setList);
  }, []);

  const filtered = axis==='all' ? list : list.filter(q=>q.axis===axis);

  return (
    <div className="p-4 flex flex-col gap-4">
      <select value={axis} onChange={e=>setAxis(e.target.value)}
              className="w-fit border p-1 rounded">
        <option value="all">Все оси</option>
        <option value="finance">Финансы</option>
        <option value="communication">Коммуникация</option>
        <option value="personalViews">Взгляды</option>
        <option value="domestic">Быт</option>
        <option value="sexuality">Интим</option>
        <option value="psyche">Психика</option>
      </select>

      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map(q => <QuestionnaireCard key={q._id} q={q} />)}
      </div>
    </div>
  );
}
