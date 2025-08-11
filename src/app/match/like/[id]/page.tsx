'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/utils/api';
import { useUserStore } from '@/store/useUserStore';

type Detail = {
  likeId: string;
  from: { id: string; username: string; avatar: string };
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
  cardSnapshot: {
    requirements: [string, string, string];
    questions: [string, string];
    updatedAt?: string;
  };
  matchScore: number;
  status: 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  createdAt: string;
};

/* eslint-disable @next/next/no-img-element */
export default function LikeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = useUserStore(s => s.user);
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    fetch(api(`/api/match/like/${id}?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(async (r: Response) => setErr((await r.json().catch(() => ({})))?.error || 'Ошибка'));
  }, [user, id]);

  if (!user) return <div className="p-4">No user</div>;
  if (!data) return <div className="p-4">Загрузка… {err && <span className="text-red-600">{err}</span>}</div>;

  const act = async (endpoint: '/api/match/accept' | '/api/match/reject') => {
    setBusy(true);
    const res = await fetch(api(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likeId: data.likeId, userId: user.id })
    });
    setBusy(false);
    if (!res.ok) return;
    if (endpoint === '/api/match/accept') router.replace('/couple-activity');
    else router.replace('/match/inbox');
  };

  const { from, cardSnapshot, answers, agreements } = data;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <img
          src={`https://cdn.discordapp.com/avatars/${from.id}/${from.avatar}.png`}
          width={48}
          height={48}
          className="rounded-full"
          alt={from.username}
        />
        <div className="font-semibold">{from.username}</div>
        <div className="ml-auto text-sm text-gray-500">Скор: {Math.round(data.matchScore)}%</div>
      </div>

      <section className="border rounded p-3">
        <h2 className="font-medium mb-2">Согласия с условиями</h2>
        <ul className="space-y-2">
          {cardSnapshot.requirements.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className={`mt-1 w-2 h-2 rounded-full ${agreements[i] ? 'bg-green-600' : 'bg-red-600'}`} />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border rounded p-3">
        <h2 className="font-medium mb-2">Ответы на ваши вопросы</h2>
        <div className="space-y-3">
          {cardSnapshot.questions.map((q, i) => (
            <div key={i}>
              <div className="text-sm text-gray-500 mb-1">{q}</div>
              <div className="border rounded px-3 py-2 bg-gray-50 whitespace-pre-wrap">{answers[i]}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex gap-3">
        <button
          onClick={() => act('/api/match/accept')}
          disabled={busy}
          className="bg-green-600 text-white rounded px-4 py-2 disabled:opacity-60"
        >
          Принять
        </button>
        <button
          onClick={() => act('/api/match/reject')}
          disabled={busy}
          className="bg-gray-200 rounded px-4 py-2 disabled:opacity-60"
        >
          Отклонить
        </button>
      </div>
    </div>
  );
}
