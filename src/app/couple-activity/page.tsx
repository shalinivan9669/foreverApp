'use client';

import { useEffect, useState } from 'react';
import { api } from '@/utils/api';
import { useUserStore } from '@/store/useUserStore';
import Link from 'next/link';

type Pair = {
  _id: string;
  members: [string, string];
  status: 'active' | 'paused' | 'ended';
  progress?: { streak: number; completed: number };
};

type U = { id: string; username: string; avatar: string };

/* eslint-disable @next/next/no-img-element */
export default function CoupleActivityPage() {
  const user = useUserStore(s => s.user);
  const [pair, setPair] = useState<Pair | null>(null);
  const [users, setUsers] = useState<Record<string, U>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/pairs/me?userId=${user.id}`))
      .then(r => r.json())
      .then(async (p: Pair | null) => {
        setPair(p);
        if (p) {
          const docs = await Promise.all(
            p.members.map(id =>
              fetch(api(`/api/users/${id}`))
                .then(r => (r.ok ? r.json() : null))
                .then(d => ({ id, username: d?.username ?? id, avatar: d?.avatar ?? '' }))
            )
          );
          const rec: Record<string, U> = {};
          docs.forEach(u => (rec[u.id] = u));
          setUsers(rec);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return <div className="p-4">No user</div>;
  if (loading) return <div className="p-4">Загрузка…</div>;
  if (!pair) {
    return (
      <div className="p-4">
        <p>Пары нет.</p>
        <Link href="/search" className="text-blue-600">Перейти в поиск</Link>
      </div>
    );
  }

  const a = users[pair.members[0]];
  const b = users[pair.members[1]];

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">Ваша пара</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <img src={`https://cdn.discordapp.com/avatars/${a?.id}/${a?.avatar}.png`} width={40} height={40} className="rounded-full" alt={a?.username || ''} />
          <span>{a?.username}</span>
        </div>
        <span className="text-gray-400">×</span>
        <div className="flex items-center gap-2">
          <img src={`https://cdn.discordapp.com/avatars/${b?.id}/${b?.avatar}.png`} width={40} height={40} className="rounded-full" alt={b?.username || ''} />
          <span>{b?.username}</span>
        </div>
      </div>

      <div className="border rounded p-3">
        <div>Статус: {pair.status}</div>
        <div>Серия дней: {pair.progress?.streak ?? 0}</div>
        <div>Завершено активностей: {pair.progress?.completed ?? 0}</div>
      </div>

      <div className="border rounded p-3">
        <p>Экран активности пары в разработке.</p>
      </div>
    </div>
  );
}
