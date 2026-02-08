'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/utils/api';
import { useUserStore } from '@/store/useUserStore';
import { fetchEnvelope } from '@/utils/apiClient';
import { pairsApi } from '@/client/api/pairs.api';

type QItem = {
  id?: string;
  _id?: string;
  text: Record<string, string>;
  scale: 'likert5' | 'bool';
  map: number[];
};

type QuestionnaireDTO = {
  title?: Record<string, string>;
  questions?: QItem[];
};

export default function PairQuestionnaireRunner() {
  const params = useParams<{ id: string; qid: string }>();
  const router = useRouter();
  const user = useUserStore((s) => s.user);
  const pairId = params?.id;
  const qnId = params?.qid;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [title, setTitle] = useState<string>('');
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [by, setBy] = useState<'A' | 'B'>('A');

  useEffect(() => {
    let on = true;
    if (!pairId || !user) return;

    pairsApi
      .getSummary(pairId)
      .then((summary) => {
        if (!on) return;
        const members: string[] = summary.pair.members ?? [];
        const which = members[0] === user.id ? 'A' : 'B';
        setBy(which);
      })
      .catch(() => {});

    return () => {
      on = false;
    };
  }, [pairId, user]);

  useEffect(() => {
    let on = true;
    if (!qnId) return;

    fetchEnvelope<QuestionnaireDTO>(api(`/api/questionnaires/${qnId}`))
      .then((questionnaire) => {
        if (!on) return;
        setTitle(questionnaire.title?.ru ?? questionnaire.title?.en ?? 'Анкета');
        const qs = Array.isArray(questionnaire.questions) ? questionnaire.questions : [];
        setQuestions(qs);
      })
      .catch(() => {});

    return () => {
      on = false;
    };
  }, [qnId]);

  useEffect(() => {
    let on = true;
    if (!pairId || !qnId) return;
    fetchEnvelope<{ sessionId: string; status: 'in_progress'; startedAt: string }>(
      api(`/api/pairs/${pairId}/questionnaires/${qnId}/start`),
      { method: 'POST' },
      { idempotency: true }
    )
      .then((d) => {
        if (on) setSessionId(d?.sessionId ?? null);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [pairId, qnId]);

  const q = questions[idx];
  const text = q?.text?.ru ?? q?.text?.en ?? '';
  const scale = q?.scale ?? 'likert5';

  const onAnswer = async (ui: number) => {
    if (!pairId || !qnId || !q) return;
    setBusy(true);
    setError(null);
    try {
      const questionId = q.id ?? q._id;
      if (!questionId) throw new Error('QUESTION_ID_REQUIRED');

      const body = { sessionId, questionId, ui };
      await fetchEnvelope<Record<string, never>>(
        api(`/api/pairs/${pairId}/questionnaires/${qnId}/answer`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        { idempotency: true }
      );
      if (idx < questions.length - 1) setIdx((i) => i + 1);
      else router.push(`/pair/${pairId}/diagnostics`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки ответа');
    } finally {
      setBusy(false);
    }
  };

  const Likert = () => (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onAnswer(n)}
          disabled={busy}
          className="px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50"
        >
          {n}
        </button>
      ))}
    </div>
  );

  const YesNo = () => (
    <div className="flex gap-2">
      <button
        onClick={() => onAnswer(1)}
        disabled={busy}
        className="px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50"
      >
        Да
      </button>
      <button
        onClick={() => onAnswer(2)}
        disabled={busy}
        className="px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50"
      >
        Нет
      </button>
    </div>
  );

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{title || 'Анкета'}</h1>

      <div className="text-sm text-gray-600">
        Ваша роль в паре: <span className="font-medium">{by}</span>
      </div>

      <div className="border rounded p-4 space-y-3">
        <div className="text-sm text-gray-500">
          Вопрос {idx + 1} / {questions.length || 1}
        </div>
        <div className="text-lg">{text}</div>
        {scale === 'bool' ? <YesNo /> : <Likert />}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </main>
  );
}
