'use client';

import { useEffect, useState } from 'react';
import type { PersonalTodayDTO, ProfileSummaryDTO } from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import {
  createEmptyPersonalToday,
  createEmptyProfileSummary,
  normalizePersonalToday,
  normalizeProfileSummary,
} from '@/client/viewmodels';

import BackBar from '@/components/ui/BackBar';
import ModeAwareProfileOverview, {
  PairedProfileDashboard,
  SoloProfileDashboard,
} from '@/components/profile/ModeAwareProfileOverview';
import PersonalTodayDashboard from '@/components/profile/today/PersonalTodayDashboard';
import Skeleton from '@/components/common/Skeleton';

const localDateKey = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export default function ProfileOverviewPage() {
  const { data: currentUser } = useCurrentUser();
  const [summary, setSummary] = useState<ProfileSummaryDTO>(createEmptyProfileSummary());
  const [today, setToday] = useState<PersonalTodayDTO>(createEmptyPersonalToday());
  const [hasSummary, setHasSummary] = useState(false);
  const [hasToday, setHasToday] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  const currentUserId = currentUser?.id ?? null;
  const loading = currentUserId !== null && loadedUserId !== currentUserId;

  useEffect(() => {
    let active = true;

    if (!currentUserId) return;

    const timezoneOffsetMin = new Date().getTimezoneOffset();
    Promise.allSettled([
      usersApi.getProfileSummary(),
      usersApi.getPersonalToday({ dateKey: localDateKey(), timezoneOffsetMin }),
    ])
      .then(([summaryResult, todayResult]) => {
        if (!active) return;
        if (summaryResult.status === 'fulfilled') {
          setSummary(normalizeProfileSummary(summaryResult.value));
          setHasSummary(true);
        } else {
          setSummary(createEmptyProfileSummary());
          setHasSummary(false);
        }
        if (todayResult.status === 'fulfilled') {
          setToday(normalizePersonalToday(todayResult.value));
          setHasToday(true);
        } else {
          setToday(createEmptyPersonalToday());
          setHasToday(false);
        }
      })
      .finally(() => {
        if (active) setLoadedUserId(currentUserId);
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  const reloadToday = async () => {
    if (!currentUser) return;
    const nextToday = await usersApi.getPersonalToday({
      dateKey: localDateKey(),
      timezoneOffsetMin: new Date().getTimezoneOffset(),
    });
    setToday(normalizePersonalToday(nextToday));
    setHasToday(true);
  };

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
        <Skeleton className="h-72" />
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
      <PersonalTodayDashboard today={today} onRefresh={reloadToday} />
      {!hasToday && (
        <div className="app-panel app-panel-solid p-4 text-sm app-muted">
          Ежедневный экран открыт в безопасном режиме. Можно обновить страницу чуть позже.
        </div>
      )}

      <section className="app-page-stack">
        <div>
          <h2 className="text-lg font-semibold">Профиль и диагностика</h2>
          <p className="app-muted mt-1 text-sm">
            Ниже — более подробная часть профиля.
          </p>
        </div>
        <ModeAwareProfileOverview summary={summary} />
      </section>
      {summary.profileMode.kind === 'paired' ? (
        <PairedProfileDashboard summary={summary} />
      ) : (
        <SoloProfileDashboard summary={summary} />
      )}
    </main>
  );
}
