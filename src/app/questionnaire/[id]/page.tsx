// src/app/questionnaire/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';
import BackBar from '@/components/ui/BackBar';
import QuestionCard from '@/components/QuestionCard';
import type { QuestionnaireType } from '@/models/Questionnaire';

// Минимальный интерфейс вопроса, который нужен UI и QuestionCard
type RenderableQ = {
  id?: string;                       // id вопроса внутри анкеты
  _id?: string;                      // (на случай старого формата)
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
};

export default function Runner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useUserStore(s => s.user);

  const [qn, setQn] = useState<QuestionnaireType | null>(null);
  const [idx, setIdx] = useState(0);

  // загрузка анкеты
  useEffect(() => {
    if (!id) return;
    let on = true;
    fetch(api(`/api/questionnaires/${id}`))
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (on) setQn(data); });
    return () => { on = false; };
  }, [id]);

  const q = qn?.questions?.[idx] as unknown as RenderableQ | undefined;
  if (!qn || !q) return <p className="p-4">Загрузка…</p>;

  const title = qn.title?.ru ?? qn.title?.en ?? 'Анкета';

  const answer = async (_qid: string, ui: number) => {
    if (!user) return;

    // Унифицируем id вопроса
    const qid = q.id ?? q._id ?? _qid;
    if (!qid) return;

    await fetch(api(`/api/questionnaires/${id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, qid, ui }),
    });

    if (idx < (qn.questions?.length ?? 0) - 1) {
      setIdx(i => i + 1);
    } else {
      router.push('/questionnaires');
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">
      <BackBar title={title} fallbackHref="/questionnaires" />

      <h2 className="font-semibold">{qn.title?.ru ?? qn.title?.en}</h2>
      <p className="text-sm text-gray-600">
        {idx + 1}/{qn.questions.length}
      </p>

      <QuestionCard q={q} onAnswer={answer} />
    </div>
  );
}
