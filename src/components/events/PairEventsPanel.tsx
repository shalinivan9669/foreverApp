'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { usePairEvents } from '@/client/hooks/usePairEvents';
import { toPairEventCardVM } from '@/client/viewmodels/pairEvent.viewmodels';

type PairEventsPanelProps = {
  pairId: string;
  pairStatus: 'active' | 'paused' | 'ended';
};

export default function PairEventsPanel({ pairId, pairStatus }: PairEventsPanelProps) {
  const {
    events,
    loading,
    error,
    refetch,
    acceptEvent,
    declineEvent,
    snoozeEvent,
    lastAcceptedActivities,
    mutationLoading,
  } = usePairEvents(pairId);
  const cards = useMemo(() => events.map(toPairEventCardVM), [events]);

  if (pairStatus === 'ended') {
    return (
      <section id="pair-events" className="app-panel app-panel-solid app-reveal scroll-mt-4 p-4 sm:p-5">
        <div className="app-muted text-xs">События пары</div>
        <h2 className="mt-1 text-xl font-semibold">Пара завершена</h2>
        <p className="app-muted mt-2 text-sm">Новые события не создаются.</p>
      </section>
    );
  }

  return (
    <section id="pair-events" className="app-panel app-panel-solid app-reveal scroll-mt-4 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="app-muted text-xs">События пары</div>
          <h2 className="mt-1 text-xl font-semibold">Поводы для следующего шага</h2>
        </div>
        <Link href="/couple-activity" className="app-btn-secondary px-3 py-2 text-sm">
          Активности
        </Link>
      </div>

      {pairStatus === 'paused' && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800">
          Пара на паузе. Новые события можно будет принять после возобновления.
        </div>
      )}

      {loading && (
        <div className="app-muted mt-4 text-sm" role="status" aria-live="polite">
          Загружаем события пары...
        </div>
      )}
      {!loading && error && (
        <div className="app-alert app-alert-error mt-4 text-sm" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={mutationLoading}
            className="app-btn-secondary mt-3 px-3 py-2 text-sm disabled:opacity-60"
          >
            Обновить
          </button>
        </div>
      )}

      {!loading && !error && cards.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-sm">
          <div className="font-medium">Пока нет актуальных событий пары.</div>
          <p className="app-muted mt-1">
            Когда появится повод — дата, перегрузка недели или безопасный общий сигнал — мы предложим мягкий следующий шаг.
          </p>
        </div>
      )}

      {!!lastAcceptedActivities.length && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
          Событие принято. Совместная активность доступна.
          <Link href="/couple-activity" className="ml-2 font-semibold underline">
            Открыть активности
          </Link>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {cards.map((card) => (
          <article key={card.id} className="rounded-lg border border-slate-100 bg-white/75 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                {card.statusLabel}
              </span>
            </div>

            <h3 className="mt-3 text-lg font-semibold">{card.title}</h3>
            <p className="app-muted mt-1 text-sm">{card.description}</p>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-medium">Почему сейчас</div>
              <p className="app-muted mt-1">{card.why}</p>
            </div>
            <div className="app-muted mt-3 text-xs">{card.dateLabel}</div>

            {card.isAccepted && card.hasGeneratedActivity && (
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
                <div className="font-medium">Событие принято</div>
                <p className="mt-1">Активности уже подготовлены для пары.</p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {card.canAccept && (
                <button
                  type="button"
                  onClick={() => void acceptEvent(card.id)}
                  disabled={mutationLoading || pairStatus !== 'active'}
                  className="app-btn-primary px-3 py-2 text-sm disabled:opacity-60"
                >
                  Принять
                </button>
              )}
              {card.canSnooze && (
                <button
                  type="button"
                  onClick={() => void snoozeEvent(card.id)}
                  disabled={mutationLoading}
                  className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                >
                  Отложить
                </button>
              )}
              {card.canDecline && (
                <button
                  type="button"
                  onClick={() => void declineEvent(card.id)}
                  disabled={mutationLoading}
                  className="app-btn-secondary px-3 py-2 text-sm disabled:opacity-60"
                >
                  Не сейчас
                </button>
              )}
              {card.hasGeneratedActivity && (
                <Link
                  href="/couple-activity"
                  className={card.isAccepted ? 'app-btn-primary px-3 py-2 text-sm' : 'app-btn-secondary px-3 py-2 text-sm'}
                >
                  Открыть активности
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
