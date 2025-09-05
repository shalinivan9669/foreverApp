// src/app/profile/(tabs)/matching/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';

export default function ProfileMatchingTab() {
  const user = useUserStore(s => s.user);
  const [inbox, setInbox] = useState<number | null>(null);
  const [outbox, setOutbox] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let on = true;
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/users/me/profile-summary?userId=${user.id}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!on || !d) return;
        setInbox(Number(d?.matching?.inboxCount ?? 0));
        setOutbox(Number(d?.matching?.outboxCount ?? 0));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { on = false; };
  }, [user]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Матчинг</h1>
        <Link href="/profile" className="text-sm text-blue-600 hover:underline">К обзору</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded p-4">
          <div className="text-sm text-gray-600">Входящие</div>
          <div className="text-2xl font-semibold">{loading ? '…' : (inbox ?? 0)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-600">Исходящие</div>
          <div className="text-2xl font-semibold">{loading ? '…' : (outbox ?? 0)}</div>
        </div>
      </div>
    </div>
  );
}

