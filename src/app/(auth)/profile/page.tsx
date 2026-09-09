'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PersonalTodayDTO, ProfileSummaryDTO } from '@/client/api/types';
import { usersApi } from '@/client/api/users.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { normalizePersonalToday } from '@/client/viewmodels/personalToday.viewmodels';
import {
  createEmptyProfileSummary,
  normalizeProfileSummary,
} from '@/client/viewmodels/profile.viewmodels';

import BackBar from '@/components/ui/BackBar';
import ErrorView from '@/components/ui/ErrorView';
import ModeAwareProfileOverview from '@/components/profile/ModeAwareProfileOverview';
import PersonalTodayDashboard from '@/components/profile/today/PersonalTodayDashboard';
import ProfilePairInvitation from '@/components/profile/ProfilePairInvitation';
import Skeleton from '@/components/common/Skeleton';

const localDateKey = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export default function ProfileOverviewPage() {
  const router = useRouter();
  const {
    data: currentUser,
    loading: userLoading,
    error: userError,
    refetch: refetchCurrentUser,
  } = useCurrentUser();
  const [summary, setSummary] = useState<ProfileSummaryDTO>(createEmptyProfileSummary());
  const [today, setToday] = useState<PersonalTodayDTO | null>(null);
  const [hasSummary, setHasSummary] = useState(false);
  const [todayReloading, setTodayReloading] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const currentUserId = currentUser?.id ?? null;
  const loading = userLoading || (currentUserId !== null && loadedUserId !== currentUserId);

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
        } else {
          setToday(null);
        }
      })
      .finally(() => {
        if (active) setLoadedUserId(currentUserId);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, loadAttempt]);

  const reloadToday = async () => {
    if (!currentUser) return;
    setTodayReloading(true);
    try {
      const nextToday = await usersApi.getPersonalToday({
        dateKey: localDateKey(),
        timezoneOffsetMin: new Date().getTimezoneOffset(),
      });
      setToday(normalizePersonalToday(nextToday));
    } catch {
      setToday(null);
    } finally {
      setTodayReloading(false);
    }
  };

  if (loading && !currentUser) {
    return (
      <main className="app-shell-dashboard space-y-3 py-3 sm:py-5">
        <BackBar title="Профиль" fallbackHref="/main-menu" />
        <Skeleton className="h-72" />
        <Skeleton className="h-24" />
      </main>
    );
  }

  if (!currentUser && userError) {
    return (
      <main className="app-shell-dashboard space-y-3 py-3 sm:py-5">
        <BackBar title="Профиль" fallbackHref="/main-menu" />
        <ErrorView
          error={userError}
          onRetry={() => void refetchCurrentUser()}
          onAuthRequired={() => router.push('/')}
        />
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="app-shell-dashboard space-y-3 py-3 sm:py-5">
        <BackBar title="Профиль" fallbackHref="/" />
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm" role="status">
          Сессия не найдена. Вернитесь ко входу через Discord.
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
        <ProfilePairInvitation user={currentUser} />
        <div className="app-panel app-panel-solid p-4 text-sm app-muted" role="alert">
          Не удалось загрузить сводку профиля. Попробуйте открыть страницу ещё раз.
          <button
            type="button"
            onClick={() => {
              setLoadedUserId(null);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="app-btn-secondary mt-3 px-4 py-2 text-sm"
          >
            Повторить
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell-dashboard app-page-stack py-3 sm:py-5 lg:py-7">
      <BackBar title="Профиль" fallbackHref="/main-menu" />
      <ProfilePairInvitation user={currentUser} />
      {today ? (
        <PersonalTodayDashboard today={today} onRefresh={reloadToday} />
      ) : (
        <section className="app-panel app-panel-solid p-4">
          <h1 className="text-lg font-semibold">Сводка за сегодня недоступна</h1>
          <p className="app-muted mt-2 text-sm">
            Пока не удалось загрузить ваши данные. Мы не показываем примерные значения вместо них.
          </p>
          <button
            type="button"
            onClick={() => void reloadToday()}
            disabled={todayReloading}
            className="app-btn-secondary mt-3 px-4 py-2 text-sm disabled:opacity-60"
          >
            {todayReloading ? 'Загружаем...' : 'Попробовать снова'}
          </button>
        </section>
      )}

      <section className="app-page-stack">
        <div>
          <h2 className="text-lg font-semibold">Личный профиль факторов</h2>
          <p className="app-muted mt-1 text-sm">
            Семантическая сводка по вашим последним рассчитанным данным.
          </p>
        </div>
        <ModeAwareProfileOverview summary={summary} />
      </section>
    </main>
  );
}
