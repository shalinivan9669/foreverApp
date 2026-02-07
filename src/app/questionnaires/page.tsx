'use client';

import { useEffect, useMemo, useState } from 'react';
import QuestionnaireCard from '@/components/QuestionnaireCard';
import BackBar from '@/components/ui/BackBar';
import { fetchEnvelope } from '@/utils/apiClient';
import { api } from '@/utils/api';

type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

type Audience = 'pair' | 'solo' | 'universal';

type QuestionnaireCardDTO = {
  id: string;
  vector: Axis;
  audience: Audience;
  title: string;
  subtitle: string;
  tagsPublic: string[];
  tagsHiddenCount: number;
  questionCount: number;
  estMinutesMin: number;
  estMinutesMax: number;
  level: 1 | 2 | 3 | 4 | 5;
  rewardCoins?: number;
  insightsCount?: number;
  status: 'new' | 'in_progress' | 'completed' | 'required' | 'locked';
  progressPct?: number;
  lockReason?: string;
  cta: 'start' | 'continue' | 'result' | 'locked';
  isStarter?: boolean;
  pairId?: string | null;
};

export default function QuestionnairesPage() {
  const [list, setList] = useState<QuestionnaireCardDTO[]>([]);
  const [axis, setAxis] = useState<Axis | 'all'>('all');
  const [aud, setAud] = useState<'all' | 'individual' | 'couple'>('all');

  useEffect(() => {
    fetchEnvelope<QuestionnaireCardDTO[]>(api('/api/questionnaires/cards'))
      .then((data) => setList(Array.isArray(data) ? data : []))
      .catch(() => setList([]));
  }, []);

  const filtered = useMemo(() => {
    return list.filter((q) => {
      if (axis !== 'all' && q.vector !== axis) return false;
      if (aud === 'couple' && q.audience !== 'pair') return false;
      if (aud === 'individual' && q.audience === 'pair') return false;
      return true;
    });
  }, [list, axis, aud]);

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <BackBar title="Анкеты" fallbackHref="/main-menu" />
      <h1 className="text-xl font-semibold mb-4">Анкеты</h1>

      {/* Фильтры */}
      <div className="flex gap-3 items-center mb-4">
        <label className="flex items-center gap-2">
          Ось:
          <select
            value={axis}
            onChange={(e) => setAxis(e.target.value as Axis | 'all')}
            className="border rounded px-2 py-1"
          >
            <option value="all">все</option>
            <option value="communication">коммуникация</option>
            <option value="domestic">быт</option>
            <option value="personalViews">взгляды</option>
            <option value="finance">финансы</option>
            <option value="sexuality">интим</option>
            <option value="psyche">психика</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          Аудитория:
          <select
            value={aud}
            onChange={(e) => setAud(e.target.value as 'all' | 'individual' | 'couple')}
            className="border rounded px-2 py-1"
          >
            <option value="all">все</option>
            <option value="individual">одиночка</option>
            <option value="couple">для пары</option>
          </select>
        </label>
      </div>

      {/* Список карточек */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map((q) => (
          <QuestionnaireCard key={q.id} q={q} />
        ))}
      </div>

      {!filtered.length && (
        <p className="text-sm text-gray-600 mt-6">
          Нет анкет под выбранные фильтры.
        </p>
      )}
    </div>
  );
}
