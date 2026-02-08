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
  `rounded px-4 py-2 text-sm font-medium ${
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
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <BackBar title="Р С’Р С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘ Р С—Р В°РЎР‚РЎвЂ№" fallbackHref="/main-menu" />
        <EmptyStateView
          title="Р СџР В°РЎР‚Р В° Р Р…Р Вµ Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р В°"
          description="Р РЋР Р…Р В°РЎвЂЎР В°Р В»Р В° РЎРѓР С•Р В·Р Т‘Р В°Р в„–РЎвЂљР Вµ Р С—Р В°РЎР‚РЎС“, Р В·Р В°РЎвЂљР ВµР С Р Р†Р ВµРЎР‚Р Р…Р С‘РЎвЂљР ВµРЎРѓРЎРЉ Р С” Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљРЎРЏР С."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <BackBar title="Р С’Р С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘ Р С—Р В°РЎР‚РЎвЂ№" fallbackHref="/main-menu" />
      <h1 className="text-2xl font-bold text-slate-900">Р С’Р С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘ Р С—Р В°РЎР‚РЎвЂ№</h1>

      <div className="flex gap-2">
        <button onClick={() => onSetTab('active')} className={tabButtonClass(tab === 'active')}>
          Р С’Р С”РЎвЂљР С‘Р Р†Р Р…Р В°РЎРЏ
        </button>
        <button onClick={() => onSetTab('suggested')} className={tabButtonClass(tab === 'suggested')}>
          Р СџРЎР‚Р ВµР Т‘Р В»Р С•Р В¶Р ВµР Р…Р С•
        </button>
        <button onClick={() => onSetTab('history')} className={tabButtonClass(tab === 'history')}>
          Р ВРЎРѓРЎвЂљР С•РЎР‚Р С‘РЎРЏ
        </button>
      </div>

      {loading && <LoadingView compact label="Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљР ВµР в„–РІР‚В¦" />}
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
                    {pendingCompleteInFlight ? 'Р вЂ”Р В°Р Р†Р ВµРЎР‚РЎв‚¬Р В°Р ВµР С...' : 'Р вЂ”Р В°Р Р†Р ВµРЎР‚РЎв‚¬Р С‘РЎвЂљРЎРЉ Р ВµРЎвЂ°Р Вµ РЎР‚Р В°Р В·'}
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
            <div className="app-panel flex items-center justify-between gap-3 p-4">
              <div>
                <div className="font-medium text-slate-900">Р СњР ВµРЎвЂљ Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С•Р в„– Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘</div>
                <div className="app-muted text-sm">Р СџРЎР‚Р ВµР Т‘Р В»Р С•Р В¶Р С‘Р С Р С—Р С•Р Т‘РЎвЂ¦Р С•Р Т‘РЎРЏРЎвЂ°Р ВµР Вµ Р В·Р В°Р Т‘Р В°Р Р…Р С‘Р Вµ</div>
              </div>
              <button onClick={onSuggestNext} className="app-btn-primary px-3 py-2 text-white">
                Р СџРЎР‚Р ВµР Т‘Р В»Р С•Р В¶Р С‘РЎвЂљРЎРЉ
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'suggested' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={onSuggestNext} className="app-btn-primary px-3 py-2 text-white">
              Р вЂўРЎвЂ°РЎвЂ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№
            </button>
          </div>

          {suggested.length === 0 && (
            <EmptyStateView title="Р СџР С•Р С”Р В° Р С—РЎС“РЎРѓРЎвЂљР С•" description="Р СњР В°Р В¶Р СР С‘РЎвЂљР Вµ Р’В«Р вЂўРЎвЂ°РЎвЂ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№Р’В», РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р С—Р С•Р В»РЎС“РЎвЂЎР С‘РЎвЂљРЎРЉ РЎРѓР С—Р С‘РЎРѓР С•Р С”." />
          )}

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
      )}

      {!loading && tab === 'history' && (
        <div className="space-y-3">
          {history.length === 0 && <EmptyStateView title="Р ВРЎРѓРЎвЂљР С•РЎР‚Р С‘РЎРЏ Р С—Р С•Р С”Р В° Р С—РЎС“РЎРѓРЎвЂљР В°" />}
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
          pendingCompleteMessage={
            pendingCompleteActivityId === checkInFor._id ? pendingCompleteMessage : null
          }
          onRetryComplete={
            pendingCompleteActivityId === checkInFor._id
              ? () => onRetryComplete(checkInFor._id)
              : undefined
          }
          retryCompleteLoading={pendingCompleteInFlight}
          onClose={onCloseCheckIn}
          onSubmit={(answers) => onSubmitCheckIn(checkInFor._id, answers)}
        />
      )}
    </main>
  );
}
