'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import ActivityCard from '@/components/activities/ActivityCard';
import CheckInModal from '@/components/activities/CheckInModal';
import BackBar from '@/components/ui/BackBar';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import type { UiErrorState } from '@/client/api/errors';
import type { ActivityCardVM } from '@/client/viewmodels';

type Tab = 'active' | 'history';

type CoupleActivityViewProps = {
  tab: Tab;
  loading: boolean;
  error: UiErrorState | null;
  locale: string;
  active: ActivityCardVM | null;
  history: ActivityCardVM[];
  hasPair: boolean;
  pairStatus?: 'active' | 'paused' | 'ended' | null;
  onRetry: () => void;
  onAuthRequired: () => void;
  onSetTab: (tab: Tab) => void;
  onCancel: (id: string) => void;
  onStart: (id: string) => void;
  onOpenCheckIn: (activity: ActivityCardVM) => void;
  checkInFor: ActivityCardVM | null;
  onCloseCheckIn: () => void;
  checkInSubmitting: boolean;
  pendingCompleteActivityId: string | null;
  pendingCompleteMessage: string | null;
  pendingCompleteInFlight: boolean;
  activityFlowMessage: string | null;
  recommendationPanel?: ReactNode;
  onRetryComplete: (activityId: string) => void;
  onSubmitCheckIn: (
    activityId: string,
    answers: Array<{ checkInId: string; ui: number }>,
    allowPairModelUse: boolean
  ) => void;
};

const tabButtonClass = (isActive: boolean): string =>
  `rounded px-3 py-2 text-sm font-medium sm:px-4 ${
    isActive ? 'app-btn-primary text-white' : 'app-btn-secondary text-slate-800'
  }`;

export default function CoupleActivityView(props: CoupleActivityViewProps) {
  const {
    tab,
    loading,
    error,
    locale,
    active,
    history,
    hasPair,
    onRetry,
    onAuthRequired,
    onSetTab,
    onCancel,
    onStart,
    onOpenCheckIn,
    checkInFor,
    onCloseCheckIn,
    checkInSubmitting,
    pendingCompleteActivityId,
    pendingCompleteMessage,
    pendingCompleteInFlight,
    activityFlowMessage,
    recommendationPanel,
    onRetryComplete,
    onSubmitCheckIn,
  } = props;
  const pairActive = props.pairStatus === undefined || props.pairStatus === 'active';
  const partial = history.find((item) => item.status === 'completed_partial' && item.resultSummary?.bothSubmitted === false);
  const completed = history.find((item) => item.resultSummary?.bothSubmitted);

  if (!hasPair && (loading || error)) {
    return (
      <main className="app-shell-dashboard app-page-stack pb-4 pt-3 sm:pb-6 sm:pt-5 lg:pt-7">
        <BackBar title="Активности пары" fallbackHref="/main-menu" />
        {loading ? (
          <LoadingView compact label="Проверяем состояние пары..." />
        ) : (
          <ErrorView error={error} onRetry={onRetry} onAuthRequired={onAuthRequired} />
        )}
      </main>
    );
  }

  if (!hasPair) {
    return (
      <main className="app-shell-dashboard app-page-stack pb-4 pt-3 sm:pb-6 sm:pt-5 lg:pt-7">
        <BackBar title="Активности пары" fallbackHref="/main-menu" />
        <EmptyStateView
          title="Пара не найдена"
          description="Сначала создайте пару, затем вернитесь к активностям."
        />
        <Link href="/invite" className="app-btn-primary inline-flex w-full justify-center px-4 py-3 text-sm sm:w-auto">
          Создать приглашение
        </Link>
      </main>
    );
  }

  return (
    <main className="app-shell-dashboard app-page-stack pb-4 pt-3 sm:pb-6 sm:pt-5 lg:pt-7">
      <BackBar title="Активности пары" fallbackHref="/main-menu" />
      <h1 className="app-page-title font-bold text-slate-900">Активности пары</h1>
      <div className="flex flex-wrap gap-3"><button type="button" className="app-btn-secondary px-3 py-2" disabled={loading || checkInSubmitting || pendingCompleteInFlight || Boolean(checkInFor)} onClick={onRetry}>Обновить состояние и отзывы</button><Link href="/development" className="app-btn-secondary px-3 py-2">Личное развитие</Link></div>
      {!pairActive && <section className="app-panel p-4"><h2 className="font-semibold">{props.pairStatus === 'paused' ? 'Пара на паузе' : 'Совместные действия недоступны'}</h2><p className="app-muted mt-2 text-sm">Личные занятия доступны отдельно. Для продолжения совместного шага проверьте текущее состояние пары.</p><Link href="/pair" className="mt-3 inline-block underline">Открыть состояние пары</Link></section>}
      {pairActive && !active && !loading && (partial || completed) && <section className="app-panel p-4" role="status"><h2 className="font-semibold">{partial ? 'Частичный итог — ожидаем второй отзыв' : 'Совместный шаг завершён'}</h2><p className="app-muted mt-2 text-sm">{partial ? 'Первый личный результат уже сохранён. В истории можно добавить недостающий отзыв; после ответа партнёра обновите состояние, чтобы увидеть общий итог.' : 'Получены оба отзыва. Общий итог доступен в истории; следующий вариант — в рекомендациях или библиотеке.'}</p><button className="app-btn-secondary mt-3 px-3 py-2" onClick={() => onSetTab('history')}>{partial ? 'Открыть частичный итог' : 'Посмотреть завершение'}</button><Link href="/development" className="app-btn-primary ml-2 mt-3 px-3 py-2">Выбрать следующий шаг</Link></section>}
      {recommendationPanel}

      <div className="app-panel-soft flex flex-wrap gap-2 p-1.5" role="tablist" aria-label="Разделы активностей">
        <button
          type="button"
          role="tab"
          id="activities-tab-active"
          aria-selected={tab === 'active'}
          aria-controls="activities-panel-active"
          onClick={() => onSetTab('active')}
          className={tabButtonClass(tab === 'active')}
        >
          Активная
        </button>
        <button
          type="button"
          role="tab"
          id="activities-tab-history"
          aria-selected={tab === 'history'}
          aria-controls="activities-panel-history"
          onClick={() => onSetTab('history')}
          className={tabButtonClass(tab === 'history')}
        >
          История
        </button>
      </div>

      {loading && <LoadingView compact label="Загрузка активностей..." />}
      {error && (
        <ErrorView error={error} onRetry={onRetry} onAuthRequired={onAuthRequired} />
      )}
      {activityFlowMessage && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status" aria-live="polite">
          {activityFlowMessage}
        </div>
      )}

      {pairActive && !loading && tab === 'active' && (
        <div
          id="activities-panel-active"
          role="tabpanel"
          aria-labelledby="activities-tab-active"
          className="activity-workspace"
        >
          {active ? (
            <div className="app-grid-wide space-y-3">
              {pendingCompleteActivityId === active._id && pendingCompleteMessage && (
                <div className="app-reveal rounded border border-amber-300 bg-amber-50 p-3 text-amber-900" role="alert">
                  <p className="text-sm">{pendingCompleteMessage}</p>
                  <button
                    type="button"
                    onClick={() => onRetryComplete(active._id)}
                    disabled={pendingCompleteInFlight}
                    className="app-btn-secondary mt-2 px-3 py-1.5 text-sm text-slate-900 disabled:opacity-60"
                  >
                    {pendingCompleteInFlight ? 'Завершаем...' : 'Завершить ещё раз'}
                  </button>
                </div>
              )}

              <ActivityCard
                activity={active}
                locale={locale}
                variant="active"
                onAccept={() => undefined}
                onStart={() => onStart(active._id)}
                onCancel={() => onCancel(active._id)}
                onComplete={() => onOpenCheckIn(active)}
              />
            </div>
          ) : (
            <div className="app-panel app-reveal app-grid-wide p-4">
              <div>
                <div className="font-medium text-slate-900">Нет активной активности</div>
                <div className="app-muted text-sm">
                  Получите одну рекомендацию текущего цикла в блоке выше.
                </div>
              </div>
            </div>
          )}

          <aside className="app-panel app-panel-solid app-grid-narrow activity-overview-card p-4 sm:p-5">
            <div>
              <div className="app-muted text-xs">Обзор активности</div>
              <h2 className="app-section-title mt-1 font-semibold">Ваш совместный ритм</h2>
            </div>
            <div className="app-metric-grid">
              <button type="button" onClick={() => onSetTab('history')} className="app-panel-soft p-3 text-left">
                <span className="app-muted block text-xs">В истории</span>
                <span className="font-display text-2xl font-semibold">{history.length}</span>
              </button>
            </div>
            <p className="app-muted app-reading-width text-sm">
              Сначала завершите текущий шаг, затем выберите следующий вариант или вернитесь к результатам.
            </p>
          </aside>
        </div>
      )}

      {pairActive && !loading && tab === 'history' && (
        <div
          id="activities-panel-history"
          role="tabpanel"
          aria-labelledby="activities-tab-history"
          className="app-collection-grid"
        >
          {history.length === 0 && <EmptyStateView title="История пока пуста" />}
          {history.map((item) => (
            <ActivityCard
              key={item._id}
              activity={item}
              locale={locale}
              variant="history"
              onAccept={() => undefined}
              onStart={() => undefined}
              onCancel={() => undefined}
              onComplete={() => onOpenCheckIn(item)}
            />
          ))}
        </div>
      )}

      {pairActive && checkInFor && (
        <CheckInModal
          activity={checkInFor}
          locale={locale}
          submitting={checkInSubmitting}
          pendingComplete={pendingCompleteActivityId === checkInFor._id}
          pendingCompleteMessage={pendingCompleteActivityId === checkInFor._id ? pendingCompleteMessage : null}
          onRetryComplete={
            pendingCompleteActivityId === checkInFor._id ? () => onRetryComplete(checkInFor._id) : undefined
          }
          retryCompleteLoading={pendingCompleteInFlight}
          onClose={onCloseCheckIn}
          onSubmit={(answers, allowPairModelUse) =>
            onSubmitCheckIn(checkInFor._id, answers, allowPairModelUse)
          }
        />
      )}
    </main>
  );
}
