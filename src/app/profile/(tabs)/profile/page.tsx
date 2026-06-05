'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ProfileSummaryDTO } from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';
import { createEmptyProfileSummary, normalizeProfileSummary } from '@/client/viewmodels';
import { AccountDetailsView } from '@/components/profile/ModeAwareProfileOverview';
import Skeleton from '@/components/common/Skeleton';

export default function ProfileDetailsTab() {
  const [data, setData] = useState<ProfileSummaryDTO>(createEmptyProfileSummary());
  const [loading, setLoading] = useState(true);
  const [hasSummary, setHasSummary] = useState(false);

  useEffect(() => {
    let active = true;

    usersApi
      .getProfileSummary()
      .then((summary) => {
        if (!active) return;
        setData(normalizeProfileSummary(summary));
        setHasSummary(true);
      })
      .catch(() => {
        if (!active) return;
        setData(createEmptyProfileSummary());
        setHasSummary(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Детали аккаунта</h1>
        <Link href="/profile" className="text-sm underline">
          К обзору
        </Link>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-56" />
            <Skeleton className="h-56" />
          </div>
        </div>
      )}

      {!loading && !hasSummary && (
        <div className="app-panel app-panel-solid p-4 text-sm app-muted">
          Не удалось загрузить детали аккаунта. Попробуйте открыть страницу ещё раз.
        </div>
      )}

      {!loading && hasSummary && <AccountDetailsView summary={data} />}
    </main>
  );
}
