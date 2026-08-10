'use client';

import type { ReactNode } from 'react';
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
  onRetry: () => void;
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
  onSubmitCheckIn: (activityId: string, answers: Array<{ checkInId: string; ui: number }>) => void;
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

  if (!hasPair) {
    return (
      <main className="app-shell-dashboard app-page-stack pb-4 pt-3 sm:pb-6 sm:pt-5 lg:pt-7">
        <BackBar title="Активности пары" fallbackHref="/main-menu" />
        <EmptyStateView
          title="Пара не найдена"
          description="Сначала создайте пару, затем вернитесь к активностям."
        />
      </main>
    );
  }

  return (
    <main className="app-shell-dashboard app-page-stack pb-4 pt-3 sm:pb-6 sm:pt-5 lg:pt-7">
      <BackBar title="Активности пары" fallbackHref="/main-menu" />
      <h1 className="app-page-title font-bold text-slate-900">Активности пары</h1>
      {recommendationPanel}

      <div className="app-panel-soft flex flex-wrap gap-2 p-1.5">
        <button onClick={() => onSetTab('active')} className={tabButtonClass(tab === 'active')}>
          Активная
        </button>
        <button onClick={() => onSetTab('history')} className={tabButtonClass(tab === 'history')}>
          История
        </button>
      </div>

      {loading && <LoadingView compact label="Загрузка активностей..." />}
      {error && <ErrorView error={error} onRetry={onRetry} />}
      {activityFlowMessage && (
        <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          {activityFlowMessage}
        </div>
      )}

      {!loading && tab === 'active' && (
        <div className="activity-workspace">
          {active ? (
            <div className="app-grid-wide space-y-3">
              {pendingCompleteActivityId === active._id && pendingCompleteMessage && (
                <div className="app-reveal rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <p className="text-sm">{pendingCompleteMessage}</p>
                  <button
                    type="button"
                    onClick={() => onRetryComplete(active._id)}
                    disabled={pendingCompleteInFlight}
                    className="app-btn-secondary mt-2 px-3 py-1.5 text-sm text-slate-900 disabled:opacity-60"
                  >
                    {pendingCompleteInFlight ? 'Завершаем...' : 'Завершить еще раз'}
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
                onSuggestNext={() => undefined}
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

      {!loading && tab === 'history' && (
        <div className="app-collection-grid">
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
              onSuggestNext={() => undefined}
            />
          ))}
        </div>
      )}

      {checkInFor && (
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
          onSubmit={(answers) => onSubmitCheckIn(checkInFor._id, answers)}
        />
      )}
    </main>
  );
}
