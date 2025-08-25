// src/app/(auth)/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';
import UserHeader from '@/components/profile/UserHeader';
import SummaryTiles from '@/components/profile/SummaryTiles';
import AxisRadar from '@/components/charts/AxisRadar';
import InsightsList from '@/components/profile/InsightsList';
import PreferencesCard from '@/components/profile/PreferencesCard';
import UserActivityCard from '@/components/activities/UserActivityCard';
import UserActivitiesPlaceholder from '@/components/activities/UserActivitiesPlaceholder';
import Skeleton from '@/components/common/Skeleton';
import Link from 'next/link';

type Axis = 'communication'|'domestic'|'personalViews'|'finance'|'sexuality'|'psyche';

type SummaryPayload = {
  user: {
    _id: string;
    handle: string;
    avatar: string | null;
    joinedAt?: string;
    lastActiveAt?: string;
    status: 'solo:new'|'solo:history'|'paired';
  };
  currentPair: { _id: string; status: string; since?: string } | null;
  metrics: { streak: { individual: number }, completed: { individual: number } };
  readiness: { score: number };
  fatigue: { score: number };
  passport: {
    levelsByAxis: Record<Axis, number>;
    strongSides: string[];
    growthAreas: string[];
    values: string[];
    boundaries: string[];
  };
  activity: {
    current: null | { _id: string; title?: string; progress?: number };
    suggested: any[];
  };
  matching: {
    inboxCount: number;
    outboxCount: number;
    filters: { age:[number,number]; radiusKm:number; valuedQualities:string[]; excludeTags:string[] }
  };
  insights: any[];
  featureFlags: { PERSONAL_ACTIVITIES?: boolean };
};

export default function ProfileOverviewPage() {
  const user = useUserStore(s => s.user);
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    if (!user) return;
    setLoading(true);
    fetch(api(`/api/users/me/profile-summary?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (on) setData(d); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [user]);

  if (!user) return <div className="p-4">No user</div>;
  if (loading || !data) return <div className="p-4"><Skeleton lines={8} /></div>;

  const ff = data.featureFlags ?? {};

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <UserHeader user={data.user} pair={data.currentPair} />

      <div className="grid md:grid-cols-3 gap-4">
        <SummaryTiles metrics={data.metrics} readiness={data.readiness} fatigue={data.fatigue} />
        <div className="md:col-span-2 border rounded p-4">
          <h3 className="font-semibold mb-3">Диагностика</h3>
          <AxisRadar levels={data.passport.levelsByAxis} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Личная активность</h3>
            <Link href="/profile/activities" className="text-sm text-blue-600 hover:underline">все</Link>
          </div>
          {ff.PERSONAL_ACTIVITIES
            ? <UserActivityCard activity={data.activity.current} suggested={data.activity.suggested} />
            : <UserActivitiesPlaceholder />}
        </div>

        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3">Инсайты</h3>
          <InsightsList items={data.insights} />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Матчинг</h3>
            <div className="flex gap-3 text-sm">
              <Link href="/search" className="text-blue-600 hover:underline">к поиску</Link>
              <Link href="/profile/matching" className="text-blue-600 hover:underline">фильтры</Link>
            </div>
          </div>
          <div className="text-sm text-gray-700">
            Входящие: <b>{data.matching.inboxCount}</b> · Исходящие: <b>{data.matching.outboxCount}</b>
          </div>
        </div>

        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3">Предпочтения партнёра</h3>
          <PreferencesCard value={data.matching.filters} editable={false} note={data.user.status === 'paired' ? 'Не влияет на текущую пару' : undefined} />
        </div>
      </div>
    </div>
  );
}