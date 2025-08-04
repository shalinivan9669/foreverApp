'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import QuestionCard from '@/components/QuestionCard';
import type { QuestionType } from '@/models/Question';
import type { QuestionnaireType } from '@/models/Questionnaire';

interface QRes extends QuestionnaireType {
  questions: (QuestionType | undefined)[];
}

export default function RunnerPage() {
  /* ─── маршрутизация / авторизация ─── */
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user   = useUserStore((s) => s.user);

  /* ─── локальное состояние ─── */
  const [qn,  setQn]  = useState<QRes | null>(null);
  const [idx, setIdx] = useState(0);

  /* ─── загрузка анкеты ─── */
  useEffect(() => {
    fetch(`/api/questionnaires/${id}`)
      .then((r) => r.json())
      .then(setQn);
  }, [id]);

  const q = qn?.questions[idx];
  if (!qn || !q) return <p className="p-4">Загрузка…</p>;

  /* ─── отправка ответа ─── */
  const submitAnswer = async (ui: number) => {
    if (!user) return;

    await fetch(`/api/questionnaires/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, qid: q._id, ui })
    });

    if (idx < qn.length - 1) setIdx(idx + 1);
    else router.push('/questionnaires');
  };

  const progress = ((idx + 1) / qn.length) * 100;

  return (
    <div className="p-4 flex flex-col gap-4 max-w-xl mx-auto">
      <h2 className="font-semibold text-lg">{qn.title}</h2>

      {/* progress-bar */}
      <div className="w-full h-2 bg-gray-200 rounded">
        <div
          className="h-full bg-blue-600 rounded"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-gray-600">
        {idx + 1}/{qn.length}
      </p>

      <QuestionCard q={q} onAnswer={(_qid, ui) => submitAnswer(ui)} />
    </div>
  );
}
