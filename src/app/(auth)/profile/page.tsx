'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';

import BackBar from '@/components/ui/BackBar';
import UserHeader from '@/components/profile/UserHeader';
import SummaryTiles from '@/components/profile/SummaryTiles';
import AxisRadar from '@/components/charts/AxisRadar';
import InsightsList from '@/components/profile/InsightsList';
import PreferencesCard from '@/components/profile/PreferencesCard';
import UserActivityCard from '@/components/activities/UserActivityCard';
import UserActivitiesPlaceholder from '@/components/activities/UserActivitiesPlaceholder';
import Skeleton from '@/components/common/Skeleton';

type Axis = 'communication'|'domestic'|'personalViews'|'finance'|'sexuality'|'psyche';

type ProfileSummary = {
  user: {
    _id: string;
    handle: string;
    avatar: string | null;
    joinedAt: string;
    status: 'solo:new'|'solo:history'|'paired';
    lastActiveAt: string;
    featureFlags?: Record<string, boolean>;
  };
  currentPair: { _id: string; status: 'active'|'paused'|'ended'; since: string } | null;
  metrics: { streak: { individual: number }; completed: { individual: number } };
  readiness: { score: number; updatedAt: string };
  fatigue:   { score: number; updatedAt: string };
  passport: { levelsByAxis: Record<Axis, number>; strongSides: string[]; growthAreas: string[]; values: string[]; boundaries: string[] };
  activity: { current: { _id: string; title?: string; progress?: number } | null; suggested: { _id: string; title?: string }[]; historyCount: number };
  matching: { inboxCount: number; outboxCount: number; filters: { age: [number,number]; radiusKm: number; valuedQualities: string[]; excludeTags: string[] } };
  insights: { _id: string; title?: string; axis?: Axis; delta?: number }[];
  featureFlags?: { PERSONAL_ACTIVITIES?: boolean };
};

export default function ProfileOverviewPage() {
  const user = useUserStore(s => s.user);
  const [data, setData] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/users/me/profile-summary?userId=${user.id}`))
      .then(r => r.json() as Promise<ProfileSummary>)
      .then(setData)
      .finally(() => setLoading(false));
  }, [user]);

  const ff = data?.featureFlags ?? { PERSONAL_ACTIVITIES: false };

  if (!user) return <div className="p-4">Нет пользователя (нужна авторизация).</div>;

  if (loading || !data) {
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

  return (
    <div className="p-4 space-y-3">
      <BackBar title="Профиль" fallbackHref="/main-menu" />

      <UserHeader user={data.user} pair={data.currentPair} />

      <SummaryTiles
        metrics={data.metrics}
        readiness={data.readiness}
        fatigue={data.fatigue}
      />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AxisRadar levels={data.passport.levelsByAxis} />
        <InsightsList items={data.insights} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Личная активность</h2>
        {ff.PERSONAL_ACTIVITIES
          ? (
            <UserActivityCard
              activity={data.activity.current}
              suggested={data.activity.suggested}
            />
          )
          : <UserActivitiesPlaceholder />
        }
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Предпочтения партнёра</h2>
        <PreferencesCard value={data.matching.filters} />
      </section>
    </div>
  );
}
