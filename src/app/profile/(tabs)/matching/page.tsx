// src/app/profile/(tabs)/matching/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usersApi } from '@/client/api/users.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { normalizeProfileSummary } from '@/client/viewmodels';

export default function ProfileMatchingTab() {
  const { data: currentUser } = useCurrentUser();
  const [inbox, setInbox] = useState<number | null>(null);
  const [outbox, setOutbox] = useState<number | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  const currentUserId = currentUser?.id ?? null;
  const hasCurrentCounts = currentUserId !== null && loadedUserId === currentUserId;
  const loading = currentUserId !== null && !hasCurrentCounts;

  useEffect(() => {
    let active = true;

    if (!currentUserId) return;

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
        if (active) setLoadedUserId(currentUserId);
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Матчинг</h1>
        <Link href="/profile" className="text-sm underline">
          К обзору
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="app-panel app-panel-solid p-4">
          <div className="app-muted text-sm">Входящие</div>
          <div className="text-2xl font-semibold">{loading ? '...' : hasCurrentCounts ? inbox ?? 0 : 0}</div>
        </div>
        <div className="app-panel app-panel-solid p-4">
          <div className="app-muted text-sm">Исходящие</div>
          <div className="text-2xl font-semibold">{loading ? '...' : hasCurrentCounts ? outbox ?? 0 : 0}</div>
        </div>
      </div>
    </main>
  );
}
