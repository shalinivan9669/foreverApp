'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';
import MatchTabs from '@/components/MatchTabs';

/* eslint-disable @next/next/no-img-element */
type Row = {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: 'sent' | 'viewed' | 'awaiting_initiator' | 'accepted' | 'rejected' | 'expired';
  matchScore: number;
  peer: { id: string; username: string; avatar: string };
};

const statusLabel: Record<Row['direction'], Record<Row['status'], string>> = {
  incoming: {
    sent: 'ожидает вашего ответа',
    viewed: 'ожидает вашего ответа',
    awaiting_initiator: 'ожидает решения инициатора',
    accepted: 'принято',
    rejected: 'отклонено',
    expired: 'истекло',
  },
  outgoing: {
    sent: 'отправлено',
    viewed: 'просмотрено',
    awaiting_initiator: 'ожидает вашего решения',
    accepted: 'принято',
    rejected: 'отклонено',
    expired: 'истекло',
  },
};

export default function InboxPage() {
  const user = useUserStore(s => s.user);
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/match/inbox?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : []))
      .then(setRows)
      .finally(() => setLoading(false));
  }, [user]);

  const incoming = useMemo(() => rows.filter(r => r.direction === 'incoming'), [rows]);
  const outgoing = useMemo(() => rows.filter(r => r.direction === 'outgoing'), [rows]);

  if (!user) return <div className="p-4">No user</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <MatchTabs />
      <h1 className="text-xl font-semibold mt-3 mb-4">Потенциальные партнёры</h1>

      {loading && <p>Загрузка…</p>}

      {!loading && (
        <>
          <section className="mb-6">
            <h2 className="font-medium mb-2">Входящие</h2>
            <div className="flex flex-col gap-2">
              {incoming.map(r => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/match/like/${r.id}`)}
                  className="w-full text-left border rounded p-2 flex items-center gap-3 hover:bg-gray-50"
                >
                  <img
                    src={`https://cdn.discordapp.com/avatars/${r.peer.id}/${r.peer.avatar}.png`}
                    width={40}
                    height={40}
                    className="rounded-full"
                    alt={r.peer.username}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{r.peer.username}</div>
                    <div className="text-xs text-gray-500">
                      {statusLabel.incoming[r.status]}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">{Math.round(r.matchScore)}%</div>
                </button>
              ))}
              {!incoming.length && <p className="text-sm text-gray-500">Нет входящих</p>}
            </div>
          </section>

          <section>
            <h2 className="font-medium mb-2">Исходящие</h2>
            <div className="flex flex-col gap-2">
              {outgoing.map(r => (
                <button
                  key={r.id}
                  onClick={() => router.push(`/match/like/${r.id}`)}
                  className="w-full text-left border rounded p-2 flex items-center gap-3 hover:bg-gray-50"
                >
                  <img
                    src={`https://cdn.discordapp.com/avatars/${r.peer.id}/${r.peer.avatar}.png`}
                    width={40}
                    height={40}
                    className="rounded-full"
                    alt={r.peer.username}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{r.peer.username}</div>
                    <div className="text-xs text-gray-500">
                      {statusLabel.outgoing[r.status]}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">{Math.round(r.matchScore)}%</div>
                </button>
              ))}
              {!outgoing.length && <p className="text-sm text-gray-500">Нет исходящих</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
