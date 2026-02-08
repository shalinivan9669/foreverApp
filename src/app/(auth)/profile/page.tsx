'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/useUserStore';
import type { ProfileSummaryDTO } from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';
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
  const user = useUserStore((s) => s.user);
  const [data, setData] = useState<ProfileSummaryDTO>(createEmptyProfileSummary());
  const [loading, setLoading] = useState(true);
  const [hasSummary, setHasSummary] = useState(false);

  useEffect(() => {
    let active = true;

    if (!user) {
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
  }, [user]);

  const ff = data.featureFlags ?? { PERSONAL_ACTIVITIES: false };

  if (!user) return <div className="p-4">Нет пользователя (нужна авторизация).</div>;

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <BackBar title="Профиль" fallbackHref="/main-menu" />
        <Skeleton className="h-20" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!hasSummary) {
    return (
      <div className="p-4 space-y-3">
        <BackBar title="Профиль" fallbackHref="/main-menu" />
        <div className="border rounded p-4 text-sm text-zinc-600">
          Не удалось загрузить сводку профиля. Попробуйте открыть страницу еще раз.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <BackBar title="Профиль" fallbackHref="/main-menu" />

      <UserHeader user={data.user} pair={data.currentPair} />

      <SummaryTiles metrics={data.metrics} readiness={data.readiness} fatigue={data.fatigue} />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AxisRadar levels={data.passport.levelsByAxis} />
        <InsightsList items={data.insights} />
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
        <h2 className="text-lg font-semibold">Предпочтения партнёра</h2>
        <PreferencesCard value={data.matching.filters} />
      </section>
    </div>
  );
}
