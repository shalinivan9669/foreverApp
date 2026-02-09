'use client';

import ActivityCard from '@/components/activities/ActivityCard';
import CheckInModal from '@/components/activities/CheckInModal';
import BackBar from '@/components/ui/BackBar';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import type { UiErrorState } from '@/client/api/errors';
import type { ActivityCardVM } from '@/client/viewmodels';

type Tab = 'active' | 'suggested' | 'history';

type CoupleActivityViewProps = {
  tab: Tab;
  loading: boolean;
  error: UiErrorState | null;
  locale: string;
  active: ActivityCardVM | null;
  suggested: ActivityCardVM[];
  history: ActivityCardVM[];
  hasPair: boolean;
  onRetry: () => void;
  onSetTab: (tab: Tab) => void;
  onSuggestNext: () => void;
  onAccept: (id: string) => void;
  onCancel: (id: string) => void;
  onOpenCheckIn: (activity: ActivityCardVM) => void;
  checkInFor: ActivityCardVM | null;
  onCloseCheckIn: () => void;
  checkInSubmitting: boolean;
  pendingCompleteActivityId: string | null;
  pendingCompleteMessage: string | null;
  pendingCompleteInFlight: boolean;
  activityFlowMessage: string | null;
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
    suggested,
    history,
    hasPair,
    onRetry,
    onSetTab,
    onSuggestNext,
    onAccept,
    onCancel,
    onOpenCheckIn,
    checkInFor,
    onCloseCheckIn,
    checkInSubmitting,
    pendingCompleteActivityId,
    pendingCompleteMessage,
    pendingCompleteInFlight,
    activityFlowMessage,
    onRetryComplete,
    onSubmitCheckIn,
  } = props;

  if (!hasPair) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-4 lg:p-6">
        <BackBar title="Активности пары" fallbackHref="/main-menu" />
        <EmptyStateView
          title="Пара не найдена"
          description="Сначала создайте пару, затем вернитесь к активностям."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-4 lg:p-6">
      <BackBar title="Активности пары" fallbackHref="/main-menu" />
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Активности пары</h1>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onSetTab('active')} className={tabButtonClass(tab === 'active')}>
          Активная
        </button>
        <button onClick={() => onSetTab('suggested')} className={tabButtonClass(tab === 'suggested')}>
          Предложено
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
        <div>
          {active ? (
            <div className="space-y-3">
              {pendingCompleteActivityId === active._id && pendingCompleteMessage && (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
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
                onCancel={() => onCancel(active._id)}
                onComplete={() => onOpenCheckIn(active)}
                onSuggestNext={onSuggestNext}
              />
            </div>
          ) : (
            <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">Нет активной активности</div>
                <div className="app-muted text-sm">Предложим подходящее задание</div>
              </div>
              <button onClick={onSuggestNext} className="app-btn-primary w-full px-3 py-2 text-white sm:w-auto">
                Предложить
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'suggested' && (
        <div className="space-y-3">
          <div className="flex justify-stretch sm:justify-end">
            <button onClick={onSuggestNext} className="app-btn-primary w-full px-3 py-2 text-white sm:w-auto">
              Еще варианты
            </button>
          </div>

          {suggested.length === 0 && (
            <EmptyStateView title="Пока пусто" description="Нажмите «Еще варианты», чтобы получить список." />
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {suggested.map((item) => (
              <ActivityCard
                key={item._id}
                activity={item}
                locale={locale}
                variant="suggested"
                onAccept={() => onAccept(item._id)}
                onCancel={() => onCancel(item._id)}
                onComplete={() => onOpenCheckIn(item)}
                onSuggestNext={() => undefined}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && tab === 'history' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {history.length === 0 && <EmptyStateView title="История пока пуста" />}
          {history.map((item) => (
            <ActivityCard
              key={item._id}
              activity={item}
              locale={locale}
              variant="history"
              onAccept={() => undefined}
              onCancel={() => undefined}
              onComplete={() => undefined}
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
