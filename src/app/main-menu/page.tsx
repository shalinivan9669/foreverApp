'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePair } from '@/client/hooks/usePair';
import { pairsApi, type PairSummaryDTO } from '@/client/api/pairs.api';
import {
  weeklyCyclesApi,
  type CurrentWeeklyCycleDTO,
} from '@/client/api/weeklyCycles.api';
import {
  recommendationsApi,
  type RecommendationDecisionDTO,
} from '@/client/api/recommendations.api';

const SIGNAL_LABELS: Record<
  CurrentWeeklyCycleDTO['pair']['signals'][number]['key'],
  string
> = {
  connection: 'Тепло и контакт',
  tension: 'Напряжение',
  recovery: 'Восстановление',
  resource: 'Ритм и ресурс',
};

const SIGNAL_STATUS: Record<
  CurrentWeeklyCycleDTO['pair']['signals'][number]['status'],
  string
> = {
  LOW: 'сейчас ниже обычного',
  STEADY: 'устойчиво',
  HIGH: 'выражено',
  MIXED: 'ощущается по-разному',
};

const PAIR_DATA_STATUS_LABELS: Record<
  CurrentWeeklyCycleDTO['pair']['dataStatus'],
  string
> = {
  NOT_READY: 'ждём ответы',
  PARTIAL: 'частичная сводка',
  ENOUGH: 'сводка готова',
  INSUFFICIENT: 'недостаточно данных',
  EXPIRED: 'цикл завершён',
};

export default function MainMenuPage() {
  const { pairId, pairMe, loading: pairLoading, error: pairError } = usePair();
  const [summary, setSummary] = useState<PairSummaryDTO | null>(null);
  const [cycle, setCycle] = useState<CurrentWeeklyCycleDTO | null>(null);
  const [recommendation, setRecommendation] =
    useState<RecommendationDecisionDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCycle = useCallback(async (activePairId: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [pairSummary, currentCycle, recommendationOverview] =
        await Promise.all([
        pairsApi.getSummary(activePairId, signal),
        weeklyCyclesApi.getCurrent(activePairId, signal),
        recommendationsApi.getOverview(activePairId, signal),
      ]);
      if (!signal?.aborted) {
        setSummary(pairSummary);
        setCycle(currentCycle);
        setRecommendation(recommendationOverview.current);
      }
    } catch {
      if (!signal?.aborted) setError('Не удалось загрузить текущий цикл.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pairId) {
      setSummary(null);
      setCycle(null);
      setRecommendation(null);
      return;
    }
    const controller = new AbortController();
    void loadCycle(pairId, controller.signal);
    return () => controller.abort();
  }, [loadCycle, pairId]);

  const primaryHref = useMemo(() => {
    if (cycle?.currentUser.completionStatus === 'SKIPPED') return '/couple-activity';
    if (cycle?.pair.dataStatus === 'ENOUGH' && recommendation) {
      return '/couple-activity';
    }
    const href = summary?.nextStep.href;
    if (!href) return pairId ? `/pair/${pairId}` : '/invite';
    return href.startsWith('#') && pairId ? `/pair/${pairId}${href}` : href;
  }, [
    cycle?.currentUser.completionStatus,
    cycle?.pair.dataStatus,
    pairId,
    recommendation,
    summary?.nextStep.href,
  ]);

  const primaryCopy = useMemo(() => {
    if (cycle?.currentUser.completionStatus === 'SKIPPED') {
      return {
        title: 'Этот check-in пропущен без штрафа',
        description:
          'Причина остаётся личной. Можно выбрать только лёгкий следующий шаг или дождаться нового цикла.',
        label: 'Посмотреть лёгкие активности',
      };
    }
    if (cycle?.pair.dataStatus === 'ENOUGH' && recommendation) {
      return {
        title: recommendation.activity.title.ru,
        description: recommendation.explanation.ru,
        label: 'Открыть рекомендацию',
      };
    }
    return {
      title: summary?.nextStep.title ?? 'Продолжить цикл',
      description: summary?.nextStep.description ?? 'Откройте текущий шаг.',
      label: summary?.nextStep.ctaLabel ?? 'Продолжить',
    };
  }, [
    cycle?.currentUser.completionStatus,
    cycle?.pair.dataStatus,
    recommendation,
    summary?.nextStep,
  ]);

  const pageLoading = pairLoading || loading;
  const currentPairStatus = summary?.pair.status ?? pairMe?.pair?.status;

  return (
    <main className="app-shell-dashboard py-4 sm:py-7">
      <header className="app-panel app-panel-solid p-5 sm:p-7">
        <div className="app-muted text-xs">Текущий цикл</div>
        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Сегодня</h1>
            <p className="app-muted mt-2 max-w-2xl text-sm">
              Один понятный следующий шаг для вашей пары — без рейтинга совместимости и
              без раскрытия личных ответов.
            </p>
          </div>
          {currentPairStatus && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {currentPairStatus === 'active'
                ? 'Пара активна'
                : currentPairStatus === 'paused'
                  ? 'Пара на паузе'
                  : 'Пара завершена'}
            </span>
          )}
        </div>
      </header>

      {pageLoading ? (
        <div className="app-panel app-panel-solid mt-4 p-5 text-sm">Загружаем состояние…</div>
      ) : !pairId ? (
        <section className="app-panel app-panel-solid mt-4 p-5 sm:p-6">
          <h2 className="text-xl font-semibold">Пригласите партнёра</h2>
          <p className="app-muted mt-2 text-sm">
            Создайте одноразовую ссылку. Пара появится только после согласия второго
            участника.
          </p>
          <Link href="/invite" className="app-btn-primary mt-4 inline-flex px-4 py-2 text-sm">
            Создать приглашение
          </Link>
        </section>
      ) : summary && cycle ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-12">
          <section className="app-panel app-panel-solid p-5 lg:col-span-7">
            <div className="app-muted text-xs">Главное действие</div>
            <h2 className="mt-1 text-2xl font-semibold">{primaryCopy.title}</h2>
            <p className="app-muted mt-2 text-sm">{primaryCopy.description}</p>
            <Link href={primaryHref} className="app-btn-primary mt-4 inline-flex px-4 py-2 text-sm">
              {primaryCopy.label}
            </Link>
          </section>

          <section className="app-panel app-panel-solid p-5 lg:col-span-5">
            <div className="app-muted text-xs">Weekly check-in</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="font-medium">Вы</div>
                <p className="app-muted mt-1">
                  {cycle.currentUser.completionStatus === 'SKIPPED'
                    ? 'Check-in пропущен'
                    : cycle.currentUser.completionStatus === 'SUBMITTED'
                      ? 'Check-in заполнен'
                      : 'Ожидает check-in'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="font-medium">Партнёр</div>
                <p className="app-muted mt-1">
                  {cycle.peer.completionStatus === 'SKIPPED'
                    ? 'Check-in пропущен'
                    : cycle.peer.completionStatus === 'SUBMITTED'
                      ? 'Check-in заполнен'
                      : 'Ответ ещё не готов'}
                </p>
              </div>
            </div>
          </section>

          <section className="app-panel app-panel-solid p-5 lg:col-span-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="app-muted text-xs">Pair Summary</div>
                <h2 className="mt-1 text-xl font-semibold">Сводка цикла</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                {PAIR_DATA_STATUS_LABELS[cycle.pair.dataStatus]}
              </span>
            </div>
            {cycle.pair.signals.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {cycle.pair.signals.map((signal) => (
                  <div key={signal.key} className="rounded-lg border border-slate-100 p-3 text-sm">
                    <div className="font-medium">{SIGNAL_LABELS[signal.key]}</div>
                    <p className="app-muted mt-1">{SIGNAL_STATUS[signal.status]}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="app-muted mt-3 text-sm">
                Общая сводка появится только после ответов обоих участников.
              </p>
            )}
          </section>

          <section className="app-panel app-panel-solid p-5 lg:col-span-5">
            <div className="app-muted text-xs">Активность</div>
            <h2 className="mt-1 text-xl font-semibold">
              {summary.currentActivity?.title.ru ||
                recommendation?.activity.title.ru ||
                'Нет активной активности'}
            </h2>
            <p className="app-muted mt-2 text-sm">
              {summary.currentActivity
                ? 'Продолжите выбранный формат или завершите отдельный feedback.'
                : recommendation
                  ? 'Открыта одна рекомендация: её можно принять, один раз заменить или пропустить без штрафа.'
                : 'После check-in система предложит один безопасный следующий шаг.'}
            </p>
            <Link href="/couple-activity" className="app-btn-secondary mt-4 inline-flex px-3 py-2 text-sm">
              Открыть активности
            </Link>
          </section>
        </div>
      ) : (
        <div className="app-alert app-alert-error mt-4 text-sm">
          {error || pairError?.message || 'Текущий цикл пока недоступен.'}
        </div>
      )}

      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {pairId && (
          <Link href={`/pair/${pairId}`} className="app-btn-secondary px-3 py-2">
            О паре
          </Link>
        )}
        {pairId && (
          <Link href="/profile/history" className="app-btn-secondary px-3 py-2">
            История
          </Link>
        )}
        <Link href="/profile" className="app-btn-secondary px-3 py-2">
          Личный профиль
        </Link>
        {pairId && (
          <Link href="/profile/safety" className="app-btn-secondary px-3 py-2">
            Приватная безопасность
          </Link>
        )}
      </nav>
    </main>
  );
}
