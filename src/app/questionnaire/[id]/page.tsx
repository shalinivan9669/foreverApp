'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import QuestionCard from '@/components/QuestionCard';
import type { QuestionnaireType } from '@/models/Questionnaire';

export default function Runner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user   = useUserStore((s) => s.user);

  const [qn, setQn]   = useState<QuestionnaireType | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/questionnaires/${id}`)
      .then((r) => r.json())
      .then(setQn);
  }, [id]);

  const q = qn?.questions[idx];
  if (!qn || !q) return <p className="p-4">Загрузка…</p>;

  const answer = async (_qid: string, ui: number) => {
    if (!user) return;

    await fetch(`/api/questionnaires/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, qid: (q as any).id ?? (q as any)._id, ui }),
    });

    if (idx < qn.questions.length - 1) setIdx(idx + 1);
    else router.push('/questionnaires');
  };

  return (
    <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">
      <h2 className="font-semibold">{qn.title?.ru ?? qn.title?.en}</h2>
      <p className="text-sm text-gray-600">
        {idx + 1}/{qn.questions.length}
      </p>

      <QuestionCard q={q as any} onAnswer={answer} />
    </div>
  );
}
