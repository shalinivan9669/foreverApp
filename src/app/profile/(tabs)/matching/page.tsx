// src/app/profile/(tabs)/matching/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { usersApi } from '@/client/api/users.api';
import { normalizeProfileSummary } from '@/client/viewmodels';

export default function ProfileMatchingTab() {
  const user = useUserStore((s) => s.user);
  const [inbox, setInbox] = useState<number | null>(null);
  const [outbox, setOutbox] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    if (!user) {
      setInbox(null);
      setOutbox(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    usersApi
      .getProfileSummary()
      .then((summary) => {
        if (!active) return;
        const normalized = normalizeProfileSummary(summary);
        setInbox(normalized.matching.inboxCount);
        setOutbox(normalized.matching.outboxCount);
      })
      .catch(() => {
        if (!active) return;
        setInbox(0);
        setOutbox(0);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Матчинг</h1>
        <Link href="/profile" className="text-sm underline">
          К обзору
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="app-panel p-4">
          <div className="app-muted text-sm">Входящие</div>
          <div className="text-2xl font-semibold">{loading ? '...' : inbox ?? 0}</div>
        </div>
        <div className="app-panel p-4">
          <div className="app-muted text-sm">Исходящие</div>
          <div className="text-2xl font-semibold">{loading ? '...' : outbox ?? 0}</div>
        </div>
      </div>
    </main>
  );
}
