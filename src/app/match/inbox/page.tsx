// src/app/match/inbox/page.tsx
'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MatchTabs from '@/components/MatchTabs';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';

type Direction = 'incoming' | 'outgoing';
type Status =
  | 'sent'
  | 'viewed'
  | 'awaiting_initiator'
  | 'mutual_ready'
  | 'paired'
  | 'rejected'
  | 'expired';

type Row = {
  id: string;
  direction: Direction;
  status: Status;
  matchScore: number;
  updatedAt?: string;
  peer: { id: string; username: string; avatar: string };
  canCreatePair: boolean;
};

const STATUS_TEXT: Record<Direction, Record<Status, string>> = {
  incoming: {
    sent: 'ожидает вашего ответа',
    viewed: 'ожидает вашего ответа',
    awaiting_initiator: 'ожидает решения инициатора',
    mutual_ready: 'готово к паре',
    paired: 'пара создана',
    rejected: 'отклонено',
    expired: 'истекло',
  },
  outgoing: {
    sent: 'отправлено',
    viewed: 'просмотрено',
    awaiting_initiator: 'ожидает вашего решения',
    mutual_ready: 'готово к паре',
    paired: 'пара создана',
    rejected: 'отклонено',
    expired: 'истекло',
  },
};

const BADGE_CLASS: Record<Status, string> = {
  sent: 'bg-gray-100 text-gray-800',
  viewed: 'bg-gray-100 text-gray-800',
  awaiting_initiator: 'bg-amber-100 text-amber-900',
  mutual_ready: 'bg-green-100 text-green-900',
  paired: 'bg-green-200 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  expired: 'bg-gray-100 text-gray-500',
};

function formatWhen(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

export default function InboxPage() {
  const router = useRouter();
  const user = useUserStore((s) => s.user);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchInbox = useCallback(async () => {
    if (!user) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(api(`/api/match/inbox?userId=${user.id}`), {
        signal: ac.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as Row[];
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr((e as Error).message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInbox();
    return () => abortRef.current?.abort();
  }, [fetchInbox]);

  const incoming = useMemo(
    () => rows.filter((r) => r.direction === 'incoming'),
    [rows]
  );
  const outgoing = useMemo(
    () => rows.filter((r) => r.direction === 'outgoing'),
    [rows]
  );

  const openLike = useCallback(
    (id: string) => {
      router.push(`/match/like/${id}`);
    },
    [router]
  );

  const createPair = useCallback(
    async (likeId: string) => {
      if (!user) return;
      const res = await fetch(api('/api/pairs/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ likeId, userId: user.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        alert(body.error || 'Не удалось создать пару');
        return;
      }
      router.replace('/couple-activity');
    },
    [router, user]
  );

  if (!user) return <div className="p-4">No user</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <MatchTabs />

      <div className="mt-3 mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Потенциальные партнёры</h1>
        <div className="flex items-center gap-2">
          {err && <span className="text-red-600 text-sm">Ошибка: {err}</span>}
          <button
            onClick={fetchInbox}
            disabled={loading}
            className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-60"
            aria-label="Обновить список"
          >
            {loading ? 'Обновляем…' : 'Обновить'}
          </button>
        </div>
      </div>

      <Section
        title="Входящие"
        rows={incoming}
        onOpen={openLike}
        onCreatePair={createPair}
      />

      <Section
        title="Исходящие"
        rows={outgoing}
        onOpen={openLike}
        onCreatePair={createPair}
      />
    </div>
  );
}

function Section(props: {
  title: string;
  rows: Row[];
  onOpen: (id: string) => void;
  onCreatePair: (id: string) => void;
}) {
  const { title, rows, onOpen, onCreatePair } = props;
  return (
    <section className="mb-8">
      <h2 className="font-medium mb-2">{title}</h2>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <article
            key={r.id}
            className="border rounded p-2 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-400"
          >
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="w-full text-left flex items-center gap-3"
              aria-label={`Открыть заявку от ${r.peer.username}`}
            >
              <img
                src={`https://cdn.discordapp.com/avatars/${r.peer.id}/${r.peer.avatar}.png`}
                width={40}
                height={40}
                className="rounded-full"
                alt={r.peer.username}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{r.peer.username}</div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded ${BADGE_CLASS[r.status]}`}
                  >
                    {STATUS_TEXT[r.direction][r.status]}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Скор: {Math.round(r.matchScore)}%{r.updatedAt ? ` · ${formatWhen(r.updatedAt)}` : ''}
                </div>
              </div>
              {r.canCreatePair && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreatePair(r.id);
                  }}
                  className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                >
                  Создать пару
                </button>
              )}
            </button>
          </article>
        ))}
        {!rows.length && (
          <p className="text-sm text-gray-500">Пусто</p>
        )}
      </div>
    </section>
  );
}
