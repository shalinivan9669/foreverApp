'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/utils/api';
import { useUserStore } from '@/store/useUserStore';

const max = { req: 80, give: 80, q: 120 };

export default function MatchCardCreatePage() {
  const router = useRouter();
  const user = useUserStore(s => s.user);

  const [requirements, setRequirements] = useState(['', '', '']);
  const [give, setGiveState] = useState(['', '', '']);     // ← переименован сеттер
  const [questions, setQuestions] = useState(['', '']);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch(api(`/api/match/card?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : null))
      .then(card => {
        if (card?.requirements?.length === 3) router.replace('/search');
      })
      .catch(() => {});
  }, [user, router]);

  if (!user) return <div className="p-4">No user</div>;

  const onSubmit = async () => {
    setErr(null);
    if (requirements.some(s => !s.trim()) || give.some(s => !s.trim()) || questions.some(s => !s.trim())) {
      setErr('Заполните все поля.');
      return;
    }
    setLoading(true);
    const res = await fetch(api('/api/match/card'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, requirements, give, questions, isActive: true })
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d?.error || 'Ошибка сохранения.');
      return;
    }
    router.replace('/search');
  };

  // универсальный биндер массива
  const bindArr =
    (arr: string[], setArr: (v: string[]) => void, m: number) =>
    (i: number, v: string) => {
      const next = arr.slice();
      next[i] = v.slice(0, m);
      setArr(next);
    };

  const setReqItem = bindArr(requirements, setRequirements, max.req);
  const setGiveItem = bindArr(give, setGiveState, max.give);     // ← новое имя
  const setQItem = bindArr(questions, setQuestions, max.q);

  const C = ({ v, max }: { v: string; max: number }) => (
    <span className="text-xs text-gray-500">{v.length}/{max}</span>
  );

  return (
    <div className="p-4 max-w-xl mx-auto flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Карточка мэтчинга</h1>
      {err && <p className="text-red-600">{err}</p>}

      <section className="space-y-2">
        <h2 className="font-medium">Мои условия (требуют согласия)</h2>
        {requirements.map((v, i) => (
          <div key={i} className="space-y-1">
            <input
              value={v}
              onChange={e => setReqItem(i, e.target.value)}
              placeholder={`Условие ${i + 1}`}
              maxLength={max.req}
              className="w-full border rounded px-3 py-2"
            />
            <C v={v} max={max.req} />
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Я готов дать</h2>
        {give.map((v, i) => (
          <div key={i} className="space-y-1">
            <input
              value={v}
              onChange={e => setGiveItem(i, e.target.value)} 
              placeholder={`Обещание ${i + 1}`}
              maxLength={max.give}
              className="w-full border rounded px-3 py-2"
            />
            <C v={v} max={max.give} />
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Мои вопросы партнёру</h2>
        {questions.map((v, i) => (
          <div key={i} className="space-y-1">
            <input
              value={v}
              onChange={e => setQItem(i, e.target.value)}
              placeholder={`Вопрос ${i + 1}`}
              maxLength={max.q}
              className="w-full border rounded px-3 py-2"
            />
            <C v={v} max={max.q} />
          </div>
        ))}
      </section>

      <button
        onClick={onSubmit}
        disabled={loading}
        className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60"
      >
        {loading ? 'Сохраняем…' : 'Сохранить и перейти к поиску'}
      </button>
    </div>
  );
}
