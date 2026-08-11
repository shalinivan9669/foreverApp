'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import PairWeeklyCheckInPanel from '@/components/checkins/PairWeeklyCheckInPanel';
import {
  pairHistoryApi,
  type PairHistoryItemDTO,
} from '@/client/api/pairHistory.api';
import { pairsApi } from '@/client/api/pairs.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import type { PairSummaryDTO } from '@/client/viewmodels/pair.viewmodels';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';

type PairProfilePageClientProps = {
  pairIdFromRoute?: string;
};

type I18n = Record<string, string>;
type PairMember = PairSummaryDTO['members'][number];

const PAIR_STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  paused: 'На паузе',
  ended: 'Завершена',
};

const formatDate = (value?: string): string =>
  value ? new Date(value).toLocaleDateString('ru-RU') : 'дата не указана';

const FACTOR_LABELS: Record<string, string> = {
  'communication.weekly.connection': 'Контакт',
  'wellbeing.current.overload': 'Текущий ресурс',
  'communication.conflict.repairSkill': 'Восстановление разговора',
  'sharedLife.roles.householdCapability': 'Бытовые роли',
};

const factorList = (factorKeys: string[]): string =>
  factorKeys.length
    ? factorKeys.map((key) => FACTOR_LABELS[key] ?? 'Совместный шаг').join(', ')
    : 'Совместный шаг';

const t = (text?: I18n): string =>
  text ? text.ru ?? text.en ?? Object.values(text)[0] ?? '' : '';

const avatarSrc = (member: PairMember): string =>
  member.avatarUrl ?? toDiscordAvatarUrl(member.id, member.avatar);

const memberName = (member?: PairMember | null): string =>
  member?.username?.trim() || 'Участник пары';

const historyStatusLabel = (item: PairHistoryItemDTO): string => {
  if (item.kind === 'cycle') {
    if (item.status === 'complete') return 'сводка готова';
    if (item.status === 'partial') return 'частичный цикл';
    return 'недостаточно данных';
  }
  if (item.status === 'completed_success') return 'завершена';
  if (item.status === 'completed_partial') return 'частичная обратная связь';
  if (item.status === 'failed') return 'не подошла';
  if (item.status === 'cancelled') return 'отменена';
  return 'истекла';
};

const difficultyLabel = (difficulty: number): string => {
  if (difficulty <= 2) return 'легко';
  if (difficulty === 3) return 'средне';
  return 'сложно';
};

const intensityLabel = (intensity: number): string => {
  if (intensity <= 1) return 'мягко';
  if (intensity === 2) return 'умеренно';
  return 'интенсивно';
};

const badgeClassForPair = (status?: string): string => {
  if (status === 'active') return 'bg-emerald-100 text-emerald-700';
  if (status === 'paused') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

function ActionLink({
  href,
  label,
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  if (!href || !label) return null;
  if (href.startsWith('#')) {
    return (
      <a href={href} className={className}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

export default function PairProfilePageClient({ pairIdFromRoute }: PairProfilePageClientProps) {
  const router = useRouter();
  const {
    data: currentUser,
    loading,
    error,
    refetch,
  } = useCurrentUser();

  if (loading && !currentUser) {
    return <LoadingView label="Загружаем профиль пары..." />;
  }

  if (!currentUser && error) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <ErrorView
          error={error}
          onRetry={() => void refetch()}
          onAuthRequired={() => router.push('/')}
        />
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm" role="status">
          Сессия не найдена. Откройте приложение из Discord ещё раз.
        </div>
      </main>
    );
  }

  return (
    <AuthenticatedPairProfile
      key={`${currentUser.id}:${pairIdFromRoute ?? 'current'}`}
      pairIdFromRoute={pairIdFromRoute}
    />
  );
}

function AuthenticatedPairProfile({ pairIdFromRoute }: PairProfilePageClientProps) {
  const router = useRouter();
  const [pairId, setPairId] = useState<string | null>(pairIdFromRoute ?? null);
  const [data, setData] = useState<PairSummaryDTO | null>(null);
  const [historyItems, setHistoryItems] = useState<PairHistoryItemDTO[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [loading, setLoading] = useState(Boolean(pairIdFromRoute));
  const [resolvingPair, setResolvingPair] = useState(!pairIdFromRoute);
  const [resolveAttempt, setResolveAttempt] = useState(0);
  const [busy, setBusy] = useState<'pause' | 'resume' | 'end' | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const confirmEndRef = useRef<HTMLDivElement | null>(null);
  const endButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirmEnd) confirmEndRef.current?.focus();
  }, [confirmEnd]);

  useEffect(() => {
    if (pairIdFromRoute) return;

    let active = true;
    pairsApi
      .getMyPair()
      .then((pairMe) => {
        if (!active) return;
        const resolvedPairId = pairMe.pair?.id ?? null;
        if (resolvedPairId) setLoading(true);
        setPairId(resolvedPairId);
      })
      .catch(() => {
        if (!active) return;
        setPairId(null);
        setLoadError('Не удалось проверить текущую пару. Проверьте соединение и попробуйте ещё раз.');
      })
      .finally(() => {
        if (active) setResolvingPair(false);
      });

    return () => {
      active = false;
    };
  }, [pairIdFromRoute, resolveAttempt]);

  const fetchPair = useCallback(async (id: string) => {
    try {
      const summary = await pairsApi.getSummary(id);
      setData(summary);
    } catch {
      setData(null);
      setLoadError('Не удалось загрузить профиль пары.');
      setLoading(false);
      return;
    }

    setLoading(false);
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const history = await pairHistoryApi.list(id, { limit: 3 });
      setHistoryItems(history.items);
    } catch {
      setHistoryItems([]);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      setLoadError(null);
      setHistoryItems([]);
      setHistoryError(false);
      await fetchPair(id);
    },
    [fetchPair]
  );

  useEffect(() => {
    if (!pairId) return;
    let active = true;

    void pairsApi
      .getSummary(pairId)
      .then((summary) => {
        if (!active) return;
        setData(summary);
        setLoading(false);
        setHistoryLoading(true);
        setHistoryError(false);
        void pairHistoryApi
          .list(pairId, { limit: 3 })
          .then((history) => {
            if (active) setHistoryItems(history.items);
          })
          .catch(() => {
            if (active) {
              setHistoryItems([]);
              setHistoryError(true);
            }
          })
          .finally(() => {
            if (active) setHistoryLoading(false);
          });
      })
      .catch(() => {
        if (!active) return;
        setData(null);
        setLoadError('Не удалось загрузить профиль пары.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pairId]);

  const onPause = async () => {
    if (!pairId) return;
    setBusy('pause');
    try {
      await pairsApi.pausePair(pairId);
      await load(pairId);
    } catch {
      setLoadError('Не удалось поставить пару на паузу.');
    } finally {
      setBusy(null);
    }
  };

  const onResume = async () => {
    if (!pairId) return;
    setBusy('resume');
    try {
      await pairsApi.resumePair(pairId);
      await load(pairId);
    } catch {
      setLoadError('Не удалось возобновить пару.');
    } finally {
      setBusy(null);
    }
  };

  const onEnd = async () => {
    if (!pairId) return;
    setBusy('end');
    try {
      await pairsApi.endPair(pairId);
      router.push('/invite');
      router.refresh();
    } catch {
      setLoadError('Не удалось завершить пару. Попробуйте ещё раз.');
      setConfirmEnd(false);
    } finally {
      setBusy(null);
    }
  };

  if (resolvingPair) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm app-muted">
          Загружаем вашу пару...
        </div>
      </main>
    );
  }

  if (!pairId) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <BackBar title="Профиль пары" fallbackHref="/main-menu" />
        {loadError ? (
          <section className="app-alert app-alert-error mt-4 text-sm" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setResolvingPair(true);
                setLoadError(null);
                setResolveAttempt((attempt) => attempt + 1);
              }}
              className="app-btn-secondary mt-3 px-4 py-2 text-sm"
            >
              Повторить
            </button>
          </section>
        ) : (
        <section className="app-panel app-panel-solid mt-4 p-4">
          <h1 className="text-xl font-semibold">Пара не найдена</h1>
          <p className="app-muted mt-2 text-sm">
            Когда появится активная пара, здесь будет общая сводка: состояние, активности и следующий шаг.
          </p>
          <Link href="/invite" className="app-btn-primary mt-4 inline-flex px-4 py-2 text-sm">
            Создать приглашение
          </Link>
        </section>
        )}
      </main>
    );
  }

  const pairStatus = data?.pair.status;
  const pairStatusLabel = pairStatus ? PAIR_STATUS_LABELS[pairStatus] ?? pairStatus : '...';
  const peerName = memberName(data?.peer);
  const dashboardReady = Boolean(data);
  const members = data?.members.length ? data.members : [];

  return (
    <main className="app-shell-dashboard app-page-stack py-3 sm:py-5 lg:py-7">
      <BackBar title="Профиль пары" fallbackHref="/main-menu" />

      {loading && (
        <div className="app-panel-soft app-panel-soft-solid p-3 text-sm app-muted" role="status" aria-live="polite">
          Загружаем данные пары...
        </div>
      )}
      {!loading && loadError && (
        <div className="app-alert app-alert-error text-sm" role="alert">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void load(pairId)}
            disabled={busy !== null}
            className="app-btn-secondary mt-3 px-4 py-2 text-sm disabled:opacity-60"
          >
            Повторить
          </button>
        </div>
      )}

      {dashboardReady && data && (
        <div className="pair-dashboard-grid">
          <section className="app-panel app-panel-solid app-reveal app-grid-full p-4 sm:p-6 xl:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {members.slice(0, 2).map((member) => (
                    <Image
                      key={member.id}
                      src={avatarSrc(member)}
                      alt={memberName(member)}
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-full border-2 border-white bg-slate-100 object-cover shadow-sm"
                    />
                  ))}
                  {!members.length && (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                      2
                    </div>
                  )}
                </div>

                <div>
                  <div className="app-muted text-xs">Вы вместе с {peerName}</div>
                  <h1 className="app-page-title font-semibold">Пространство пары</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClassForPair(pairStatus)}`}>
                      {pairStatusLabel}
                    </span>
                    <span className="app-muted">с {formatDate(data.pair.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:ml-auto sm:justify-end">
                {data.pair.status === 'active' && (
                  <button
                    type="button"
                    onClick={onPause}
                    disabled={busy === 'pause'}
                    className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                  >
                    Пауза
                  </button>
                )}
                {data.pair.status === 'paused' && (
                  <button
                    type="button"
                    onClick={onResume}
                    disabled={busy === 'resume'}
                    className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                  >
                    Возобновить
                  </button>
                )}
                {data.pair.status === 'ended' ? (
                  <Link href="/invite" className="app-btn-primary px-3 py-2 text-sm">
                    Новое подключение
                  </Link>
                ) : (
                  <Link href="/couple-activity" className="app-btn-primary px-3 py-2 text-sm">
                    Активности
                  </Link>
                )}
                <Link href="/profile/history" className="app-btn-secondary px-3 py-2 text-sm">
                  История
                </Link>
                {data.pair.status !== 'ended' && (
                  <button
                    ref={endButtonRef}
                    type="button"
                    onClick={() => setConfirmEnd(true)}
                    disabled={busy !== null}
                    aria-expanded={confirmEnd}
                    aria-controls="end-pair-confirmation"
                    className="min-h-11 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-700 disabled:opacity-60"
                  >
                    Завершить пару
                  </button>
                )}
              </div>
            </div>

            {confirmEnd && (
              <div
                ref={confirmEndRef}
                id="end-pair-confirmation"
                role="alertdialog"
                aria-labelledby="end-pair-confirmation-title"
                tabIndex={-1}
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 outline-none"
              >
                <p id="end-pair-confirmation-title" className="font-semibold">Завершить текущую пару?</p>
                <p className="mt-1">
                  Текущий общий контекст будет закрыт. При новом соединении появится новая пара без переноса закрытого контекста.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onEnd}
                    disabled={busy === 'end'}
                    className="rounded-lg bg-rose-700 px-3 py-2 font-medium text-white disabled:opacity-60"
                  >
                    {busy === 'end' ? 'Завершаем…' : 'Да, завершить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmEnd(false);
                      requestAnimationFrame(() => endButtonRef.current?.focus());
                    }}
                    disabled={busy === 'end'}
                    className="app-btn-secondary px-3 py-2"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="app-panel app-panel-solid app-reveal app-grid-narrow border-l-4 border-l-rose-300 p-4 sm:p-5">
            <div className="app-muted text-xs">Что нам делать дальше?</div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold">{data.nextStep.title}</h2>
                <p className="app-muted mt-2 text-sm">{data.nextStep.description}</p>
              </div>
              <ActionLink
                href={data.nextStep.href}
                label={data.nextStep.ctaLabel}
                className="app-btn-primary inline-flex shrink-0 px-4 py-2 text-sm"
              />
            </div>
          </section>

          <section className="app-panel app-panel-solid app-reveal app-grid-narrow p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="app-muted text-xs">Текущая активность</div>
                <h2 className="mt-1 text-xl font-semibold">
                  {data.currentActivity ? t(data.currentActivity.title) || 'Активность пары' : 'Сейчас нет активной активности'}
                </h2>
              </div>
              <Link href="/couple-activity" className="app-btn-secondary shrink-0 px-3 py-2 text-sm">
                Открыть
              </Link>
            </div>

            {data.currentActivity ? (
              <div className="mt-3 text-sm">
                <div className="app-muted">
                  {factorList(data.currentActivity.targetFactorKeys)} • {difficultyLabel(data.currentActivity.difficulty)} •{' '}
                  {intensityLabel(data.currentActivity.intensity)}
                </div>
                <p className="mt-2">
                  Лучше завершить текущую активность и только потом брать следующий шаг.
                </p>
              </div>
            ) : (
              <div className="mt-3 text-sm">
                <p className="app-muted">
                  Можно получить новую активность по текущему состоянию пары.
                </p>
                <Link href="/couple-activity" className="app-btn-primary mt-3 inline-flex px-4 py-2 text-sm">
                  Получить активность
                </Link>
              </div>
            )}

            <div className="app-muted mt-3 text-sm">
              В предложенных сейчас: <b>{data.suggestedCount}</b>
            </div>
          </section>

          <section id="weekly-checkin" className="app-reveal app-grid-wide scroll-mt-4">
            <PairWeeklyCheckInPanel
              pairId={pairId}
              pairStatus={data.pair.status}
              onSummaryChanged={() => load(pairId)}
            />
          </section>

          <section className="app-panel app-panel-solid app-reveal app-grid-wide p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="app-muted text-xs">Недавняя история</div>
                <h2 className="mt-1 text-xl font-semibold">Недавние циклы и действия</h2>
              </div>
              <Link href="/profile/history" className="app-btn-secondary px-3 py-2 text-sm">
                Вся история
              </Link>
            </div>
            {historyLoading ? (
              <p className="app-muted mt-4 text-sm">Загружаем историю…</p>
            ) : historyError ? (
              <div className="app-alert app-alert-rate mt-4 text-sm" role="alert">
                <p>Не удалось загрузить недавнюю историю.</p>
                <button
                  type="button"
                  onClick={() => void load(pairId)}
                  className="app-btn-secondary mt-3 px-3 py-2 text-sm"
                >
                  Повторить
                </button>
              </div>
            ) : historyItems.length ? (
              <ul className="mt-4 space-y-2">
                {historyItems.map((item) => (
                  <li
                    key={`${item.kind}:${item.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white/70 p-3 text-sm"
                  >
                    <span className="font-medium">
                      {item.kind === 'cycle' ? 'Недельный цикл' : item.title}
                    </span>
                    <span className="app-muted">
                      {new Date(item.date).toLocaleDateString('ru-RU')} · {historyStatusLabel(item)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="app-muted mt-4 text-sm">
                История появится после первого цикла или завершённой активности.
              </p>
            )}
          </section>

        </div>
      )}
    </main>
  );
}
