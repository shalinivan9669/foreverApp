'use client';

import ActivityCard from '@/components/activities/ActivityCard';
import CheckInModal from '@/components/activities/CheckInModal';
import BackBar from '@/components/ui/BackBar';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import type { UiErrorState } from '@/client/api/errors';
import type {
  PairActivitySuggestionPlanDTO,
  PairActivitySuggestionResponse,
} from '@/client/api/types';
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
  suggestionPlan: PairActivitySuggestionPlanDTO | null;
  lastSuggestionSkippedReason: PairActivitySuggestionResponse['skippedReason'];
  lastCreatedCount: number | null;
  onRetryComplete: (activityId: string) => void;
  onSubmitCheckIn: (activityId: string, answers: Array<{ checkInId: string; ui: number }>) => void;
};

const tabButtonClass = (isActive: boolean): string =>
  `rounded px-3 py-2 text-sm font-medium sm:px-4 ${
    isActive ? 'app-btn-primary text-white' : 'app-btn-secondary text-slate-800'
  }`;

const SKIPPED_REASON_LABELS: Record<string, string> = {
  current_activity: 'у пары уже есть активная задача',
  pair_paused: 'пара сейчас на паузе',
  pair_ended: 'пара завершена',
  offered_limit: 'уже есть 3 предложенные задачи',
  plan_blocked: 'сейчас лучше не создавать новые задачи',
  all_templates_in_cooldown: 'похожие задачи недавно уже предлагались',
  no_templates: 'нет подходящих шаблонов',
};

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
    suggestionPlan,
    lastSuggestionSkippedReason,
    lastCreatedCount,
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

      <div className="app-panel-soft flex flex-wrap gap-2 p-1.5">
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
                onCancel={() => onCancel(active._id)}
                onComplete={() => onOpenCheckIn(active)}
                onSuggestNext={onSuggestNext}
              />
            </div>
          ) : (
            <div className="app-panel app-reveal app-grid-wide flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">Нет активной активности</div>
                <div className="app-muted text-sm">Предложим подходящее задание</div>
              </div>
              <button onClick={onSuggestNext} className="app-btn-primary w-full px-3 py-2 text-white sm:w-auto">
                Предложить
              </button>
            </div>
          )}

          <aside className="app-panel app-panel-solid app-grid-narrow activity-overview-card p-4 sm:p-5">
            <div>
              <div className="app-muted text-xs">Обзор активности</div>
              <h2 className="app-section-title mt-1 font-semibold">Ваш совместный ритм</h2>
            </div>
            <div className="app-metric-grid">
              <button type="button" onClick={() => onSetTab('suggested')} className="app-panel-soft p-3 text-left">
                <span className="app-muted block text-xs">Предложено</span>
                <span className="font-display text-2xl font-semibold">{suggested.length}</span>
              </button>
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

      {!loading && tab === 'suggested' && (
        <div className="space-y-3">
          {suggestionPlan && (
            <div className="app-panel-soft rounded-lg p-4 text-sm text-slate-800">
              <div className="font-medium text-slate-900">
                Почему такие предложения?
              </div>
              <p className="mt-1">{suggestionPlan.explanation.ru}</p>
              {lastSuggestionSkippedReason && (
                <p className="mt-2 text-amber-800">
                  Новые варианты не созданы:{' '}
                  {SKIPPED_REASON_LABELS[lastSuggestionSkippedReason] ??
                    'сейчас новые варианты недоступны'}.
                </p>
              )}
              {!lastSuggestionSkippedReason &&
                typeof lastCreatedCount === 'number' && (
                  <p className="app-muted mt-2 text-xs">
                    Создано новых вариантов: {lastCreatedCount}.
                  </p>
                )}
            </div>
          )}

          <div className="flex justify-stretch sm:justify-end">
            <button onClick={onSuggestNext} className="app-btn-primary w-full px-3 py-2 text-white sm:w-auto">
              Еще варианты
            </button>
          </div>

          {suggested.length === 0 && (
            <EmptyStateView title="Пока пусто" description="Нажмите «Еще варианты», чтобы получить список." />
          )}

          <div className="app-collection-grid">
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
        <div className="app-collection-grid">
          {history.length === 0 && <EmptyStateView title="История пока пуста" />}
          {history.map((item) => (
            <ActivityCard
              key={item._id}
              activity={item}
              locale={locale}
              variant="history"
              onAccept={() => undefined}
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
