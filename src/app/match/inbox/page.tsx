// src/app/match/inbox/page.tsx
'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MatchTabs from '@/components/MatchTabs';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';

/* ----- типы из API ----- */
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
  id: string; // like id
  direction: Direction;
  status: Status;
  matchScore: number;
  updatedAt?: string;
  peer: { id: string; username: string; avatar: string };
  canCreatePair: boolean;
};

/* Деталка лайка (для модалки ответа) */
type CardSnapshot = { requirements: [string, string, string]; questions: [string, string]; updatedAt?: string };
type LikeDTO = {
  id: string;
  status: Status;
  matchScore: number;
  from: { id: string; username: string; avatar: string };
  to:   { id: string; username: string; avatar: string };
  fromCardSnapshot: CardSnapshot;                 // карточка инициатора
  recipientResponse: null | {
    agreements: [boolean, boolean, boolean];
    answers: [string, string];
    initiatorCardSnapshot: CardSnapshot;          // снапшот карточки инициатора в момент ответа
    at: string;
  };
  decisions: {
    initiator: null | { accepted: boolean; at: string };
    recipient: null | { accepted: boolean; at: string };
  };
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
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

/* ---------------------------------- страница ---------------------------------- */

export default function InboxPage() {
  const router = useRouter();
  const user = useUserStore(s => s.user);

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
      const res = await fetch(api('/api/match/inbox'), { signal: ac.signal });
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

  const incoming = useMemo(() => rows.filter(r => r.direction === 'incoming'), [rows]);
  const outgoing = useMemo(() => rows.filter(r => r.direction === 'outgoing'), [rows]);

  /* --- действия --- */

  const openRespond = useCallback((id: string) => {
  const r = rows.find(x => x.id === id);
  if (!r) return;

  if (r.direction === 'incoming' && (r.status === 'sent' || r.status === 'viewed')) {
    setRespondLikeId(id);
  } else {
    router.push(`/match/like/${id}`);
  }
}, [rows, router]);

  const acceptByInitiator = useCallback(async (likeId: string, accepted: boolean) => {
    if (!user) return;
    const endpoint = accepted ? '/api/match/accept' : '/api/match/reject';
    const res = await fetch(api(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likeId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error || 'Не удалось сохранить решение');
      return;
    }
    fetchInbox();
  }, [user, fetchInbox]);

  const createPair = useCallback(async (likeId: string) => {
    if (!user) return;
       const res = await fetch(api('/api/match/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likeId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error || 'Не удалось создать пару');
      return;
    }
    router.replace('/couple-activity');
  }, [router, user]);

  /* --- модалка ответа --- */
  const [respondLikeId, setRespondLikeId] = useState<string | null>(null);

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
        onOpen={openRespond}
        onAccept={(id) => acceptByInitiator(id, true)}   // не используется для входящих
        onReject={(id) => acceptByInitiator(id, false)}  // не используется для входящих
        onCreatePair={createPair}
      />

      <Section
        title="Исходящие"
        rows={outgoing}
        onOpen={(id) => router.push(`/match/like/${id}`)}
        onAccept={(id) => acceptByInitiator(id, true)}
        onReject={(id) => acceptByInitiator(id, false)}
        onCreatePair={createPair}
      />

      {respondLikeId && (
        <RespondModal
          likeId={respondLikeId}
          onClose={() => setRespondLikeId(null)}
          onDone={() => {
            setRespondLikeId(null);
            fetchInbox();
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------- раздел списка -------------------------------- */

function Section(props: {
  title: string;
  rows: Row[];
  onOpen: (id: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onCreatePair: (id: string) => void;
}) {
  const { title, rows, onOpen, onAccept, onReject, onCreatePair } = props;

  return (
    <section className="mb-8">
      <h2 className="font-medium mb-2">{title}</h2>
      <div className="flex flex-col gap-2">
        {rows.map(r => {
          const canRespond = r.direction === 'incoming' && (r.status === 'sent' || r.status === 'viewed');
          const canDecide  = r.direction === 'outgoing' && r.status === 'awaiting_initiator';
          return (
            <article key={r.id} className="border rounded p-2">
              <div className="w-full text-left flex items-center gap-3">
                <button type="button" onClick={() => onOpen(r.id)} className="flex items-center gap-3 flex-1">
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
                      <span className={`text-[11px] px-2 py-0.5 rounded ${BADGE_CLASS[r.status]}`}>
                        {STATUS_TEXT[r.direction][r.status]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Скор: {Math.round(r.matchScore)}%
                      {r.updatedAt ? ` · ${formatWhen(r.updatedAt)}` : ''}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  {canRespond && (
                    <button
                      type="button"
                      onClick={() => onOpen(r.id)}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                    >
                      Ответить
                    </button>
                  )}

                  {canDecide && (
                    <>
                      <button
                        type="button"
                        onClick={() => onAccept(r.id)}
                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                      >
                        Принять
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject(r.id)}
                        className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                      >
                        Отклонить
                      </button>
                    </>
                  )}

                  {r.canCreatePair && (
                    <button
                      type="button"
                      onClick={() => onCreatePair(r.id)}
                      className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
                    >
                      Создать пару
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!rows.length && <p className="text-sm text-gray-500">Пусто</p>}
      </div>
    </section>
  );
}

/* ------------------------------ модалка «Ответить» ------------------------------ */

function RespondModal(props: {
  likeId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { likeId, onClose, onDone } = props;
  const user = useUserStore(s => s.user);
  const [like, setLike] = useState<LikeDTO | null>(null);
  const [agree, setAgree] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [ans, setAns] = useState<[string, string]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const res = await fetch(api(`/api/match/like/${likeId}`));
      const d = (await res.json()) as LikeDTO;
      if (!on) return;
      setLike(d);
      setAgree([false, false, false]);
      setAns(['', '']);
      setErr(null);
    })();
    return () => { on = false; };
  }, [likeId]);

  const canSend =
    !!like &&
    agree.every(Boolean) &&
    ans[0].trim().length > 0 &&
    ans[1].trim().length > 0 &&
    ans[0].length <= 280 &&
    ans[1].length <= 280;

  const send = useCallback(async () => {
    if (!user || !canSend) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(api('/api/match/respond'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        likeId,                    // <-- критично: передаём likeId
        agreements: [true, true, true],
        answers: ans,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(body.error || 'Не удалось отправить ответ');
      return;
    }
    onDone();
  }, [user, canSend, likeId, ans, onDone]);

  if (!like) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <img
            src={`https://cdn.discordapp.com/avatars/${like.from.id}/${like.from.avatar}.png`}
            width={40}
            height={40}
            className="rounded-full"
            alt={like.from.username}
          />
          <div className="font-medium">Ответ на заявку @{like.from.username}</div>
          <button onClick={onClose} className="ml-auto text-gray-500 hover:text-black" aria-label="Закрыть">✕</button>
        </div>

        <div className="p-4 space-y-4">
          <section>
            <h3 className="font-medium mb-2">Согласие с условиями</h3>
            <ul className="space-y-2">
              {like.fromCardSnapshot.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agree[i]}
                      onChange={e => {
                        const a = [...agree] as [boolean, boolean, boolean];
                        a[i] = e.target.checked;
                        setAgree(a);
                      }}
                    />
                    <span>{r}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium mb-2">Ответьте на вопросы</h3>
            {like.fromCardSnapshot.questions.map((q, i) => (
              <div key={i} className="space-y-1">
                <div className="text-sm text-gray-500">{q}</div>
                <textarea
                  value={ans[i]}
                  onChange={e => {
                    const a = [...ans] as [string, string];
                    a[i] = e.target.value.slice(0, 280);
                    setAns(a);
                  }}
                  maxLength={280}
                  rows={3}
                  className="w-full border rounded px-3 py-2"
                />
                <div className="text-xs text-gray-500">{ans[i].length}/280</div>
              </div>
            ))}
          </section>

          {err && <p className="text-red-600">{err}</p>}
        </div>

        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200">Отмена</button>
          <button
            onClick={send}
            disabled={!canSend || busy}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          >
            {busy ? 'Отправляем…' : 'Отправить ответ'}
          </button>
        </div>
      </div>
    </div>
  );
}
