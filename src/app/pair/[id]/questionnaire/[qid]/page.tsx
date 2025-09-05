'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/utils/api';
import { useUserStore } from '@/store/useUserStore';

type QItem = {
  id?: string;
  _id?: string;
  text: Record<string,string>;
  scale: 'likert5'|'bool';
  map: number[];
};

export default function PairQuestionnaireRunner() {
  const params = useParams<{ id: string; qid: string }>();
  const router = useRouter();
  const user = useUserStore(s => s.user);
  const pairId = params?.id;
  const qnId = params?.qid;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QItem[]>([]);
  const [title, setTitle] = useState<string>('');
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [by, setBy] = useState<'A'|'B'>('A');

  // Determine A/B from pair summary
  useEffect(() => {
    let on = true;
    if (!pairId || !user) return;
    fetch(api(`/api/pairs/${pairId}/summary`))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!on || !d?.pair) return;
        const members: string[] = d.pair.members ?? [];
        const which = members[0] === user.id ? 'A' : 'B';
        setBy(which);
      }).catch(() => {});
    return () => { on = false; };
  }, [pairId, user]);

  // Load questionnaire
  useEffect(() => {
    let on = true;
    if (!qnId) return;
    fetch(api(`/api/questionnaires/${qnId}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!on || !d) return;
        setTitle(d?.title?.ru ?? d?.title?.en ?? 'Опросник');
        const qs = Array.isArray(d?.questions) ? d.questions as QItem[] : [];
        setQuestions(qs);
      }).catch(() => {});
    return () => { on = false; };
  }, [qnId]);

  // Start session
  useEffect(() => {
    let on = true;
    if (!pairId || !qnId) return;
    fetch(api(`/api/pairs/${pairId}/questionnaires/${qnId}/start`), { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (on) setSessionId(d?.sessionId ?? null); })
      .catch(() => {});
    return () => { on = false; };
  }, [pairId, qnId]);

  const q = questions[idx];
  const text = q?.text?.ru ?? q?.text?.en ?? '';
  const scale = q?.scale ?? 'likert5';

  const onAnswer = async (ui: number) => {
    if (!pairId || !qnId || !q) return;
    setBusy(true);
    setError(null);
    try {
      const body = { sessionId, questionId: q.id ?? q._id!, ui, by };
      const res = await fetch(api(`/api/pairs/${pairId}/questionnaires/${qnId}/answer`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Не удалось сохранить ответ');
      if (idx < questions.length - 1) setIdx(i => i + 1);
      else router.push(`/pair/${pairId}/diagnostics`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const Likert = () => (
    <div className="flex gap-2">
      {[1,2,3,4,5].map(n => (
        <button key={n} onClick={() => onAnswer(n)} disabled={busy}
          className="px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50">{n}</button>
      ))}
    </div>
  );
  const YesNo = () => (
    <div className="flex gap-2">
      <button onClick={() => onAnswer(1)} disabled={busy} className="px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50">Нет</button>
      <button onClick={() => onAnswer(2)} disabled={busy} className="px-3 py-2 rounded border hover:bg-gray-50 disabled:opacity-50">Да</button>
    </div>
  );

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{title || 'Опросник'}</h1>

      <div className="text-sm text-gray-600">Вы отвечаете как: <span className="font-medium">{by}</span></div>

      <div className="border rounded p-4 space-y-3">
        <div className="text-sm text-gray-500">Вопрос {idx + 1} / {questions.length || 1}</div>
        <div className="text-lg">{text}</div>
        {scale === 'bool' ? <YesNo/> : <Likert/>}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>
    </main>
  );
}
