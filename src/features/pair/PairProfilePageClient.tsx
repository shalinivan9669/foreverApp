'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import PairWeeklyCheckInPanel from '@/components/checkins/PairWeeklyCheckInPanel';
import PairEventsPanel from '@/components/events/PairEventsPanel';
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

const AXIS_LABELS: Record<string, string> = {
  communication: 'Коммуникация',
  domestic: 'Быт',
  personalViews: 'Личные взгляды',
  finance: 'Финансы',
  sexuality: 'Близость',
  psyche: 'Ресурс',
};

const PAIR_STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  paused: 'На паузе',
  ended: 'Завершена',
};

const SEVERITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'слабый сигнал',
  2: 'средний риск',
  3: 'высокий риск',
};

const formatDate = (value?: string): string =>
  value ? new Date(value).toLocaleDateString('ru-RU') : 'дата не указана';

const axisLabel = (axis?: string): string =>
  axis ? AXIS_LABELS[axis] ?? 'Общая зона' : 'Общая зона';

const axisList = (axes: string[]): string =>
  axes.length ? axes.map(axisLabel).join(', ') : 'Общая зона';

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
  if (item.status === 'completed_partial') return 'частичный feedback';
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

const severityClass = (severity: 1 | 2 | 3): string => {
  if (severity === 3) return 'bg-rose-100 text-rose-700';
  if (severity === 2) return 'bg-amber-100 text-amber-700';
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
  const { data: currentUser } = useCurrentUser();
  const [pairId, setPairId] = useState<string | null>(pairIdFromRoute ?? null);
  const [data, setData] = useState<PairSummaryDTO | null>(null);
  const [historyItems, setHistoryItems] = useState<PairHistoryItemDTO[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvingPair, setResolvingPair] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'resume' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!currentUser) {
      setPairId(null);
      setData(null);
      setHistoryItems([]);
      return () => {
        active = false;
      };
    }

    if (pairIdFromRoute) {
      setPairId(pairIdFromRoute);
      return () => {
        active = false;
      };
    }

    setResolvingPair(true);
    pairsApi
      .getMyPair()
      .then((pairMe) => {
        if (!active) return;
        setPairId(pairMe.pair?.id ?? null);
      })
      .catch(() => {
        if (!active) return;
        setPairId(null);
      })
      .finally(() => {
        if (active) setResolvingPair(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser, pairIdFromRoute]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    setHistoryItems([]);
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
    try {
      const history = await pairHistoryApi.list(id, { limit: 3 });
      setHistoryItems(history.items);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pairId) {
      setData(null);
      setHistoryItems([]);
      return;
    }
    void load(pairId);
  }, [pairId, load]);

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

  if (!currentUser) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">
          Нет пользователя. Откройте приложение из Discord ещё раз.
        </div>
      </main>
    );
  }

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
        <section className="app-panel app-panel-solid mt-4 p-4">
          <h1 className="text-xl font-semibold">Пара не найдена</h1>
          <p className="app-muted mt-2 text-sm">
            Когда появится активная пара, здесь будет общий dashboard: состояние, активности и следующий шаг.
          </p>
          <Link href="/invite" className="app-btn-primary mt-4 inline-flex px-4 py-2 text-sm">
            Создать приглашение
          </Link>
        </section>
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
        <div className="app-panel-soft app-panel-soft-solid p-3 text-sm app-muted">
          Загружаем dashboard пары...
        </div>
      )}
      {!loading && loadError && <div className="app-alert app-alert-error text-sm">{loadError}</div>}

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
                  <h1 className="app-page-title font-semibold">Dashboard пары</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${badgeClassForPair(pairStatus)}`}>
                      {pairStatusLabel}
                    </span>
                    <span className="app-muted">с {formatDate(data.pair.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:ml-auto sm:justify-end">
                {data.pair.status === 'active' ? (
                  <button
                    type="button"
                    onClick={onPause}
                    disabled={busy === 'pause'}
                    className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                  >
                    Пауза
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onResume}
                    disabled={busy === 'resume'}
                    className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                  >
                    Возобновить
                  </button>
                )}
                <Link href="/couple-activity" className="app-btn-primary px-3 py-2 text-sm">
                  Активности
                </Link>
                <Link href="/profile/history" className="app-btn-secondary px-3 py-2 text-sm">
                  История
                </Link>
              </div>
            </div>

            <div className="app-metric-grid mt-5">
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3">
                <div className="app-muted text-xs">Серия</div>
                <div className="text-xl font-semibold">{data.pair.progress?.streak ?? 0}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3">
                <div className="app-muted text-xs">Выполнено</div>
                <div className="text-xl font-semibold">{data.pair.progress?.completed ?? 0}</div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3">
                <div className="app-muted text-xs">Участники</div>
                <div className="truncate text-sm font-medium">
                  {members.map(memberName).join(' + ') || 'Пара'}
                </div>
              </div>
            </div>
          </section>

          <section className="app-panel app-panel-solid app-reveal app-grid-narrow border-l-4 border-l-rose-300 p-4 sm:p-5">
            <div className="app-muted text-xs">Что нам делать дальше?</div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold">{data.nextStep.title}</h2>
                <p className="app-muted mt-2 text-sm">{data.nextStep.description}</p>
                {data.nextStep.severity && (
                  <span className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs ${severityClass(data.nextStep.severity)}`}>
                    {SEVERITY_LABELS[data.nextStep.severity]}
                  </span>
                )}
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
                  {axisList(data.currentActivity.axis)} • {difficultyLabel(data.currentActivity.difficulty)} •{' '}
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

          <div className="app-grid-narrow">
            <PairEventsPanel pairId={pairId} pairStatus={data.pair.status} />
          </div>

          <section className="app-panel app-panel-solid app-reveal app-grid-wide p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="app-muted text-xs">History light</div>
                <h2 className="mt-1 text-xl font-semibold">Недавние циклы и действия</h2>
              </div>
              <Link href="/profile/history" className="app-btn-secondary px-3 py-2 text-sm">
                Вся история
              </Link>
            </div>
            {historyLoading ? (
              <p className="app-muted mt-4 text-sm">Загружаем историю…</p>
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
