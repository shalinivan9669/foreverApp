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
    let on = true;

    if (!user) {
      setInbox(null);
      setOutbox(null);
      return () => {
        on = false;
      };
    }

    setLoading(true);
    usersApi
      .getProfileSummary()
      .then((summary) => {
        if (!on) return;
        const normalized = normalizeProfileSummary(summary);
        setInbox(normalized.matching.inboxCount);
        setOutbox(normalized.matching.outboxCount);
      })
      .catch(() => {
        if (!on) return;
        setInbox(0);
        setOutbox(0);
      })
      .finally(() => {
        if (on) setLoading(false);
      });

    return () => {
      on = false;
    };
  }, [user]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">РњР°С‚С‡РёРЅРі</h1>
        <Link href="/profile" className="text-sm text-blue-600 hover:underline">Рљ РѕР±Р·РѕСЂСѓ</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="border rounded p-4">
          <div className="text-sm text-gray-600">Р’С…РѕРґСЏС‰РёРµ</div>
          <div className="text-2xl font-semibold">{loading ? 'вЂ¦' : (inbox ?? 0)}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-600">РСЃС…РѕРґСЏС‰РёРµ</div>
          <div className="text-2xl font-semibold">{loading ? 'вЂ¦' : (outbox ?? 0)}</div>
        </div>
      </div>
    </div>
  );
}
