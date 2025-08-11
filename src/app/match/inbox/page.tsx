'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/utils/api';
import { useUserStore } from '@/store/useUserStore';

/* eslint-disable @next/next/no-img-element */
type Item = {
  likeId: string;
  fromId: string;
  username: string;
  avatar: string;
  matchScore: number;
  createdAt: string;
};

export default function InboxPage() {
  const user = useUserStore(s => s.user);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/match/inbox?userId=${user.id}`))
      .then(r => r.json())
      .then(setItems)
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return <div className="p-4">No user</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Заявки</h1>
      {loading && <p>Загрузка…</p>}
      {!loading && items.length === 0 && <p>Пока нет заявок.</p>}
      <div className="flex flex-col gap-2">
        {items.map(it => (
          <Link
            key={it.likeId}
            href={`/match/like/${it.likeId}`}
            className="border rounded px-3 py-2 flex items-center gap-3 hover:bg-gray-50"
          >
            <img
              src={`https://cdn.discordapp.com/avatars/${it.fromId}/${it.avatar}.png`}
              width={40}
              height={40}
              className="rounded-full"
              alt={it.username}
            />
            <div className="flex-1">
              <div className="font-medium">{it.username}</div>
              <div className="text-xs text-gray-500">
                Скор: {Math.round(it.matchScore)}%
              </div>
            </div>
            <span className="text-sm text-blue-600">Открыть</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
