'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  recommendationsApi,
  type RecommendationDecisionDTO,
} from '@/client/api/recommendations.api';
import { isApiClientError } from '@/client/api/errors';

type RecommendationDecisionPanelProps = {
  pairId: string;
  targetDecisionId?: string | null;
  onActivityChanged: () => void;
};

type Action = 'offer' | 'accept' | 'replace' | 'skip';

const ACTION_ERROR =
  'Не удалось обновить рекомендацию. Обновите экран и попробуйте ещё раз.';
const SUMMARY_NOT_READY_ERROR =
  'Сначала завершите текущую еженедельную отметку. Рекомендация появится после общего итога или завершённого сценария с недостаточными данными.';

const actionErrorMessage = (error: unknown): string =>
  error instanceof Error &&
  isApiClientError(error) &&
  error.code === 'RECOMMENDATION_SUMMARY_NOT_READY'
    ? SUMMARY_NOT_READY_ERROR
    : ACTION_ERROR;

export default function RecommendationDecisionPanel({
  pairId,
  targetDecisionId,
  onActivityChanged,
}: RecommendationDecisionPanelProps) {
  return (
    <RecommendationDecisionPanelSession
      key={pairId}
      pairId={pairId}
      targetDecisionId={targetDecisionId}
      onActivityChanged={onActivityChanged}
    />
  );
}

function RecommendationDecisionPanelSession({
  pairId,
  targetDecisionId,
  onActivityChanged,
}: RecommendationDecisionPanelProps) {
  const [current, setCurrent] = useState<RecommendationDecisionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'replace' | 'skip' | null>(null);
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (targetDecisionId && !loading) {
      panelRef.current?.scrollIntoView({ block: 'start' });
      panelRef.current?.focus({ preventScroll: true });
    }
  }, [targetDecisionId, loading]);

  useEffect(() => {
    if (confirmAction) confirmationRef.current?.focus();
  }, [confirmAction]);

  const fetchOverview = useCallback(
    (signal?: AbortSignal) => recommendationsApi.getOverview(pairId, signal),
    [pairId]
  );

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      return fetchOverview(signal)
        .then((overview) => {
          if (!signal?.aborted) setCurrent(overview.current);
        })
        .catch(() => {
          if (!signal?.aborted) setError(ACTION_ERROR);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [fetchOverview]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchOverview(controller.signal)
      .then((overview) => {
        if (!controller.signal.aborted) setCurrent(overview.current);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(ACTION_ERROR);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchOverview]);

  const run = useCallback(
    async (nextAction: Action) => {
      if (action) return;
      setAction(nextAction);
      setConfirmAction(null);
      setError(null);
      setMessage(null);
      try {
        if (nextAction === 'offer') {
          setCurrent(await recommendationsApi.offer(pairId));
          return;
        }
        if (!current) return;
        if (nextAction === 'replace') {
          setCurrent(await recommendationsApi.replace(pairId, current.id));
          setMessage('Показана одна безопасная альтернатива. Повторной замены в этом цикле нет.');
          onActivityChanged();
          return;
        }
        if (nextAction === 'accept') {
          await recommendationsApi.accept(pairId, current.id);
          setCurrent(null);
          setMessage('Активность принята и доступна во вкладке «Активная».');
          onActivityChanged();
          return;
        }
        await recommendationsApi.skip(pairId, current.id);
        setCurrent(null);
        setMessage('Рекомендация пропущена без штрафа. Можно вернуться в следующем цикле.');
        onActivityChanged();
      } catch (actionError) {
        setError(actionErrorMessage(actionError));
      } finally {
        setAction(null);
      }
    },
    [action, current, onActivityChanged, pairId]
  );

  return (
    <section ref={panelRef} tabIndex={-1} className="app-panel app-panel-solid scroll-mt-4 p-4 sm:p-5" aria-live="polite">
      <div className="app-muted text-xs">Рекомендация текущего цикла</div>
      {targetDecisionId && !loading && current?.id !== targetDecisionId && <p className="app-alert app-alert-rate mt-3 text-sm" role="status">Предложение из уведомления уже изменилось, принято или завершено. Ниже показано актуальное состояние; повторять прежнее действие не требуется.</p>}
      {loading ? (
        <p className="mt-2 text-sm">Загружаем рекомендацию…</p>
      ) : current ? (
        <div className="mt-2">
          <h2 className="text-xl font-semibold text-slate-900">
            {current.activity.title.ru}
          </h2>
          <p className="app-muted mt-2 text-sm">{current.explanation.ru}</p>
          <p className="app-muted mt-2 text-xs">
            Можно принять, пропустить без штрафа или один раз попросить альтернативу.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {current.canAccept && (
              <button
                type="button"
                className="app-btn-primary px-4 py-2 text-sm disabled:opacity-60"
                disabled={Boolean(action) || Boolean(confirmAction)}
                onClick={() => void run('accept')}
              >
                {action === 'accept' ? 'Принимаем…' : 'Принять'}
              </button>
            )}
            {current.canReplace && (
              <button
                type="button"
                className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-60"
                disabled={Boolean(action) || Boolean(confirmAction)}
                onClick={() => setConfirmAction('replace')}
              >
                {action === 'replace' ? 'Ищем альтернативу…' : 'Другая активность'}
              </button>
            )}
            {current.canSkip && (
              <button
                type="button"
                className="app-btn-secondary px-4 py-2 text-sm disabled:opacity-60"
                disabled={Boolean(action) || Boolean(confirmAction)}
                onClick={() => setConfirmAction('skip')}
              >
                {action === 'skip' ? 'Пропускаем…' : 'Пропустить без штрафа'}
              </button>
            )}
          </div>
          {confirmAction && (
            <div
              ref={confirmationRef}
              role="alertdialog"
              aria-labelledby="recommendation-confirmation-title"
              tabIndex={-1}
              className="app-alert app-alert-rate mt-4 text-sm outline-none"
            >
              <p id="recommendation-confirmation-title" className="font-semibold">
                {confirmAction === 'replace'
                  ? 'Показать единственную альтернативу?'
                  : 'Пропустить рекомендацию в этом цикле?'}
              </p>
              <p className="mt-1">
                {confirmAction === 'replace'
                  ? 'После замены вернуться к текущему варианту или заменить ещё раз не получится.'
                  : 'Пропуск не несёт штрафа, но эта рекомендация закроется.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="app-btn-primary px-3 py-2 text-sm"
                  onClick={() => void run(confirmAction)}
                >
                  {confirmAction === 'replace' ? 'Да, заменить' : 'Да, пропустить'}
                </button>
                <button
                  type="button"
                  className="app-btn-secondary px-3 py-2 text-sm"
                  onClick={() => setConfirmAction(null)}
                >
                  Вернуться
                </button>
              </div>
            </div>
          )}
        </div>
      ) : error ? (
        <div className="mt-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Не удалось проверить рекомендацию
          </h2>
          <p className="app-muted mt-1 text-sm">
            Мы не создаём новый вариант, пока текущее состояние неизвестно.
          </p>
        </div>
      ) : (
        <div className="mt-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Нет открытой рекомендации
          </h2>
          <p className="app-muted mt-1 text-sm">
            Система предложит один доступный и privacy-safe следующий шаг.
          </p>
          <button
            type="button"
            className="app-btn-primary mt-3 px-4 py-2 text-sm disabled:opacity-60"
            disabled={Boolean(action)}
            onClick={() => void run('offer')}
          >
            {action === 'offer' ? 'Подбираем…' : 'Получить рекомендацию'}
          </button>
        </div>
      )}
      {message && <p className="mt-3 text-sm text-emerald-800">{message}</p>}
      {error && (
        <div className="app-alert app-alert-error mt-3 text-sm">
          <p>{error}</p>
          <button
            type="button"
            className="app-btn-secondary mt-3 px-3 py-2 text-sm"
            onClick={() => void load()}
          >
            Обновить
          </button>
        </div>
      )}
    </section>
  );
}
