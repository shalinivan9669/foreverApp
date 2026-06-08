'use client';

import { useEffect, useState } from 'react';
import type { ProfileSummaryDTO } from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { createEmptyProfileSummary, normalizeProfileSummary } from '@/client/viewmodels';

import BackBar from '@/components/ui/BackBar';
import ModeAwareProfileOverview, {
  PairedProfileDashboard,
  SoloProfileDashboard,
} from '@/components/profile/ModeAwareProfileOverview';
import Skeleton from '@/components/common/Skeleton';

export default function ProfileOverviewPage() {
  const { data: currentUser } = useCurrentUser();
  const [data, setData] = useState<ProfileSummaryDTO>(createEmptyProfileSummary());
  const [loading, setLoading] = useState(true);
  const [hasSummary, setHasSummary] = useState(false);

  useEffect(() => {
    let active = true;

    if (!currentUser) {
      setLoading(false);
      setHasSummary(false);
      setData(createEmptyProfileSummary());
      return () => {
        active = false;
      };
    }

    setLoading(true);
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
  }, [currentUser]);

  if (!currentUser) {
    return (
      <main className="app-shell-dashboard py-3 sm:py-5">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">
          Нет пользователя: нужна авторизация.
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="app-shell-dashboard space-y-3 py-3 sm:py-5">
        <BackBar title="Профиль" fallbackHref="/main-menu" />
        <Skeleton className="h-20" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-40" />
      </main>
    );
  }

  if (!hasSummary) {
    return (
      <main className="app-shell-dashboard space-y-3 py-3 sm:py-5">
        <BackBar title="Профиль" fallbackHref="/main-menu" />
        <div className="app-panel app-panel-solid p-4 text-sm app-muted">
          Не удалось загрузить сводку профиля. Попробуйте открыть страницу ещё раз.
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell-dashboard app-page-stack py-3 sm:py-5 lg:py-7">
      <BackBar title="Профиль" fallbackHref="/main-menu" />
      <ModeAwareProfileOverview summary={data} />
      {data.profileMode.kind === 'paired' ? (
        <PairedProfileDashboard summary={data} />
      ) : (
        <SoloProfileDashboard summary={data} />
      )}
    </main>
  );
}
