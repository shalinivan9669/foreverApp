'use client';

import { useEffect, useState } from 'react';
import type { ProfileSummaryDTO } from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { createEmptyProfileSummary, normalizeProfileSummary } from '@/client/viewmodels';

import BackBar from '@/components/ui/BackBar';
import UserHeader from '@/components/profile/UserHeader';
import SummaryTiles from '@/components/profile/SummaryTiles';
import AxisRadar from '@/components/charts/AxisRadar';
import InsightsList from '@/components/profile/InsightsList';
import PreferencesCard from '@/components/profile/PreferencesCard';
import UserActivityCard from '@/components/activities/UserActivityCard';
import UserActivitiesPlaceholder from '@/components/activities/UserActivitiesPlaceholder';
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

  const ff = data.featureFlags ?? { PERSONAL_ACTIVITIES: false };

  if (!currentUser) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">Нет пользователя (нужна авторизация).</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="app-shell-compact space-y-3 py-3 sm:py-4">
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
      <main className="app-shell-compact space-y-3 py-3 sm:py-4">
        <BackBar title="Профиль" fallbackHref="/main-menu" />
        <div className="app-panel app-panel-solid p-4 text-sm app-muted">
          Не удалось загрузить сводку профиля. Попробуйте открыть страницу еще раз.
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <BackBar title="Профиль" fallbackHref="/main-menu" />

      <UserHeader user={data.user} pair={data.currentPair} />

      <SummaryTiles metrics={data.metrics} readiness={data.readiness} fatigue={data.fatigue} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="app-panel app-panel-solid p-4">
          <h2 className="mb-3 text-base font-semibold">Паспорт по осям</h2>
          <AxisRadar levels={data.passport.levelsByAxis} />
        </div>
        <div className="app-panel app-panel-solid p-4">
          <h2 className="mb-3 text-base font-semibold">Инсайты</h2>
          <InsightsList items={data.insights} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Личная активность</h2>
        {ff.PERSONAL_ACTIVITIES ? (
          <UserActivityCard activity={data.activity.current} suggested={data.activity.suggested} />
        ) : (
          <UserActivitiesPlaceholder />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Предпочтения партнера</h2>
        <div className="app-panel app-panel-solid p-4">
          <PreferencesCard value={data.matching.filters} />
        </div>
      </section>
    </main>
  );
}
