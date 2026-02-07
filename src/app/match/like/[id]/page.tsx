// src/app/match/like/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';

/* eslint-disable @next/next/no-img-element */

type Status =
  | 'sent'
  | 'viewed'
  | 'awaiting_initiator'
  | 'mutual_ready'
  | 'paired'
  | 'rejected'
  | 'expired';

type CardSnapshot = {
  requirements: [string, string, string];
  questions: [string, string];
  updatedAt?: string;
};

type DecisionDTO = { accepted: boolean; at: string };

type LikeDTO = {
  id: string;
  status: Status;
  matchScore: number;
  updatedAt?: string;

  // В API уже приходят готовые avatar-URL
  from: { id: string; username: string; avatar: string };
  to:   { id: string; username: string; avatar: string };

  // эти поля в ответе могут отсутствовать в legacy-лайках — делаем опциональными
  agreements?: [boolean, boolean, boolean];
  answers?: [string, string];
  cardSnapshot?: CardSnapshot;

  fromCardSnapshot?: CardSnapshot;

  recipientResponse: null | {
    agreements: [boolean, boolean, boolean];
    answers: [string, string];
    initiatorCardSnapshot: CardSnapshot;
    at: string;
  };

  decisions: {
    initiator: DecisionDTO | null;
    recipient: DecisionDTO | null;
  };
};

type PostBody =
  | { likeId: string }
  | { likeId: string; accepted?: boolean };

export default function LikeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useUserStore((s) => s.user);

  const [like, setLike] = useState<LikeDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(api(`/api/match/like/${id}`));
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b?.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as LikeDTO;
        if (on) setLike(data);
      } catch (e) {
        if (on) setErr((e as Error).message || 'Ошибка');
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [id]);

  const iAmInitiator = useMemo(() => {
    if (!user || !like) return false;
    return like.from.id === user.id;
  }, [user, like]);

  const visibleSnapshot: CardSnapshot | null = useMemo(() => {
    if (!like || !user) return null;
    if (iAmInitiator) return like.cardSnapshot ?? null;
    return like.fromCardSnapshot ?? like.recipientResponse?.initiatorCardSnapshot ?? null;
  }, [like, user, iAmInitiator]);

  const canAcceptReject = useMemo(
    () => iAmInitiator && like?.status === 'awaiting_initiator',
    [iAmInitiator, like]
  );
const canCreatePair = useMemo(
  () => iAmInitiator && like?.status === 'mutual_ready',
  [iAmInitiator, like]
);

  async function post(endpoint: string, body: PostBody): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(api(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b?.error || `HTTP ${res.status}`);
      }
      const fresh = (await fetch(api(`/api/match/like/${id}`)).then((r) => r.json())) as LikeDTO;
      setLike(fresh);
    } catch (e) {
      setErr((e as Error).message || 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const onAccept = () => {
    if (!user || !like) return;
    post('/api/match/accept', { likeId: like.id });
  };

  const onReject = () => {
    if (!user || !like) return;
    post('/api/match/reject', { likeId: like.id });
  };

  const onCreatePair = async () => {
    if (!user || !like) return;
    await post('/api/match/confirm', { likeId: like.id });
    router.replace('/couple-activity');
  };

  if (!user) return <div className="p-4">No user</div>;
  if (loading) return <div className="p-4">Загрузка…</div>;
  if (err) return <div className="p-4 text-red-600">{err}</div>;
  if (!like) return null;

  const formatWhen = (iso?: string) =>
    iso ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '';

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <button onClick={() => router.back()} className="text-sm text-gray-600 hover:underline">
        ← Назад
      </button>

      <header className="flex items-center gap-3">
        <img
          src={like.from.avatar}
          width={36}
          height={36}
          className="rounded-full"
          alt={like.from.username}
        />
        <span className="text-sm text-gray-500">→</span>
        <img
          src={like.to.avatar}
          width={36}
          height={36}
          className="rounded-full"
          alt={like.to.username}
        />
        <div className="ml-auto text-sm text-gray-600">
          Скор: {Math.round(like.matchScore)}%{like.updatedAt ? ` · ${formatWhen(like.updatedAt)}` : ''}
        </div>
      </header>

      <section className="border rounded p-3">
        <div className="font-medium mb-2">Карточка партнёра</div>
        {!visibleSnapshot ? (
          <div className="text-sm text-gray-500">Снапшот карточки недоступен</div>
        ) : (
          <>
            <div className="mb-2">
              <div className="text-xs text-gray-500 mb-1">Условия</div>
              <ul className="list-disc ml-4 text-sm">
                {visibleSnapshot.requirements.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Вопросы</div>
              {visibleSnapshot.questions.map((q, i) => (
                <div key={i} className="p-2 bg-gray-50 rounded text-sm">
                  {q}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-3">
        <div className="border rounded p-3">
          <div className="font-medium mb-2">Твои ответы (инициатор)</div>
          <div className="text-sm">
            <div className="text-xs text-gray-500 mb-1">Согласие</div>
            <div>{like.agreements?.map((v, i) => <span key={i}>{v ? '✅' : '❌'} </span>)}</div>
          </div>
          <div className="mt-2 space-y-2">
            <div className="text-xs text-gray-500">Ответы</div>
            <div className="p-2 bg-gray-50 rounded text-sm">{like.answers?.[0] ?? '—'}</div>
            <div className="p-2 bg-gray-50 rounded text-sm">{like.answers?.[1] ?? '—'}</div>
          </div>
        </div>

        <div className="border rounded p-3">
          <div className="font-medium mb-2">Ответ получателя</div>
          {!like.recipientResponse ? (
            <div className="text-sm text-gray-500">Пока нет ответа</div>
          ) : (
            <>
              <div className="text-xs text-gray-500 mb-1">Согласие</div>
              <div className="text-sm">
                {like.recipientResponse.agreements.map((v, i) => (
                  <span key={i}>{v ? '✅' : '❌'} </span>
                ))}
              </div>
              <div className="mt-2 space-y-2">
                <div className="text-xs text-gray-500">Ответы</div>
                <div className="p-2 bg-gray-50 rounded text-sm">{like.recipientResponse.answers[0]}</div>
                <div className="p-2 bg-gray-50 rounded text-sm">{like.recipientResponse.answers[1]}</div>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="flex gap-2">
        {canAcceptReject && (
          <>
            <button
              disabled={busy}
              onClick={onAccept}
              className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-60"
            >
              Принять
            </button>
            <button
              disabled={busy}
              onClick={onReject}
              className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60"
            >
              Отклонить
            </button>
          </>
        )}
        {canCreatePair && (
          <button
            disabled={busy}
            onClick={onCreatePair}
            className="px-3 py-2 rounded bg-emerald-600 text-white disabled:opacity-60"
          >
            Создать пару
          </button>
        )}
      </footer>
    </main>
  );
}
