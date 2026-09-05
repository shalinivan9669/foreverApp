'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { usePair } from '@/client/hooks/usePair';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { pairsApi, type PairSummaryDTO } from '@/client/api/pairs.api';
import {
  weeklyCyclesApi,
  type CurrentWeeklyCycleDTO,
} from '@/client/api/weeklyCycles.api';
import {
  recommendationsApi,
  type RecommendationDecisionDTO,
} from '@/client/api/recommendations.api';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import { toUiErrorState, type UiErrorState } from '@/client/api/errors';
import ErrorView from '@/components/ui/ErrorView';

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
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const existingPartnerIntent = currentUser?.entryCohort === 'EXISTING_PARTNER';
  const {
    pairId,
    pairMe,
    loading: pairLoading,
    error: pairError,
    refetch: refetchPair,
  } = usePair();
  const [summary, setSummary] = useState<PairSummaryDTO | null>(null);
  const [cycle, setCycle] = useState<CurrentWeeklyCycleDTO | null>(null);
  const [recommendation, setRecommendation] =
    useState<RecommendationDecisionDTO | null>(null);
  const [loadedPairId, setLoadedPairId] = useState<string | null>(null);
  const [cycleLoading, setCycleLoading] = useState(false);
  const [error, setError] = useState<UiErrorState | null>(null);

  const loadCycle = useCallback(async (activePairId: string, signal?: AbortSignal) => {
    setCycleLoading(true);
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
        setLoadedPairId(activePairId);
        setError(null);
      }
    } catch (caughtError) {
      if (!signal?.aborted) {
        const normalized =
          caughtError instanceof Error
            ? caughtError
            : new Error('Не удалось загрузить текущий цикл.');
        setError(toUiErrorState(normalized));
        setLoadedPairId(activePairId);
      }
    } finally {
      if (!signal?.aborted) setCycleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pairId) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadCycle(pairId, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadCycle, pairId]);

  const activeSummary = loadedPairId === pairId ? summary : null;
  const activeCycle = loadedPairId === pairId ? cycle : null;
  const activeRecommendation = loadedPairId === pairId ? recommendation : null;

  const primaryHref = (() => {
    if (activeCycle?.currentUser.completionStatus === 'SKIPPED') return '/couple-activity';
    if (activeCycle?.pair.dataStatus === 'ENOUGH' && activeRecommendation) {
      return '/couple-activity';
    }
    const href = activeSummary?.nextStep.href;
    if (!href) return pairId ? `/pair/${pairId}` : '/invite';
    return href.startsWith('#') && pairId ? `/pair/${pairId}${href}` : href;
  })();

  const primaryCopy = (() => {
    if (activeCycle?.currentUser.completionStatus === 'SKIPPED') {
      return {
        title: 'Эта еженедельная отметка пропущена без штрафа',
        description:
          'Причина остаётся личной. Можно выбрать только лёгкий следующий шаг или дождаться нового цикла.',
        label: 'Посмотреть лёгкие активности',
      };
    }
    if (activeCycle?.pair.dataStatus === 'ENOUGH' && activeRecommendation) {
      return {
        title: activeRecommendation.activity.title.ru,
        description: activeRecommendation.explanation.ru,
        label: 'Открыть рекомендацию',
      };
    }
    return {
      title: activeSummary?.nextStep.title ?? 'Продолжить цикл',
      description: activeSummary?.nextStep.description ?? 'Откройте текущий шаг.',
      label: activeSummary?.nextStep.ctaLabel ?? 'Продолжить',
    };
  })();

  const pageLoading =
    pairLoading ||
    cycleLoading ||
    Boolean(pairId && loadedPairId !== pairId && error === null);
  const currentPairStatus = activeSummary?.pair.status ?? pairMe?.pair?.status;

  return (
    <main className="app-shell-menu py-3 sm:py-5 lg:py-7">
      <NotificationPanel enabled={!pairLoading && !pairError} />

      <div className="app-menu-grid mt-4">
        {pageLoading ? (
          <section
            className="app-tile app-tile-rose app-reveal app-menu-hero min-h-[13rem]"
            role="status"
            aria-live="polite"
          >
            <div className="app-tile-content">
              <span className="mb-auto w-fit rounded-full bg-white/65 px-3 py-1 text-xs font-medium">
                Текущий цикл
              </span>
              <h1 className="app-tile-title mt-6">Загружаем состояние…</h1>
              <p className="app-tile-description">
                Остальные разделы уже доступны.
              </p>
            </div>
          </section>
        ) : error || pairError ? (
          <section className="app-tile app-tile-rose app-reveal app-menu-hero min-h-[13rem]">
            <div className="app-tile-content">
              <div className="w-full">
                <ErrorView
                  error={error ?? pairError}
                  onRetry={() => {
                    if (pairId) {
                      void loadCycle(pairId);
                      return;
                    }
                    void refetchPair();
                  }}
                  onAuthRequired={() => router.push('/')}
                />
              </div>
            </div>
          </section>
        ) : !pairId ? (
          <Link
            href={existingPartnerIntent ? '/invite' : '/development'}
            aria-label={existingPartnerIntent ? 'Связать партнёра' : 'Личное развитие'}
            className="app-tile app-tile-rose app-reveal app-menu-hero group relative min-h-[13rem]"
          >
            <div className="app-tile-content">
              <span className="mb-auto w-fit rounded-full bg-white/65 px-3 py-1 text-xs font-medium">
                {existingPartnerIntent ? 'Начать вместе' : 'Мой следующий шаг'}
              </span>
              <div className="mt-6">
                <h1 className="app-tile-title">{existingPartnerIntent ? 'Свяжите вашу пару' : 'Начните с себя'}</h1>
                <p className="app-tile-description">
                  {existingPartnerIntent ? 'Передайте партнёру свой код или приглашение. Сверьте друг друга и подтвердите пару с обеих сторон.' : 'Исследуйте свои ожидания, выберите посильную практику и подготовьтесь к знакомству.'}
                </p>
                <span className="mt-4 inline-flex w-fit rounded-full bg-white/75 px-3 py-2 text-sm font-semibold shadow-sm">
                  {existingPartnerIntent ? 'Связать партнёра' : 'Выбрать личный шаг'}
                </span>
              </div>
            </div>
          </Link>
        ) : activeSummary && activeCycle ? (
            <Link
              href={primaryHref}
              aria-label={primaryCopy.label}
              className="app-tile app-tile-rose app-reveal app-menu-hero group relative min-h-[13rem]"
            >
              <div className="app-tile-content">
                <div className="mb-auto flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-white/65 px-3 py-1 text-xs font-medium">
                    Текущий цикл
                  </span>
                  {currentPairStatus && (
                    <span className="rounded-full bg-white/65 px-3 py-1 text-xs">
                      {currentPairStatus === 'active'
                        ? 'Пара активна'
                        : currentPairStatus === 'paused'
                          ? 'Пара на паузе'
                          : 'Пара завершена'}
                    </span>
                  )}
                </div>

                <div className="mt-6">
                  <h1 className="app-tile-title">{primaryCopy.title}</h1>
                  <p className="app-tile-description">{primaryCopy.description}</p>

                  <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                    <div className="rounded-xl bg-white/50 px-3 py-2">
                      <div className="font-medium">Вы</div>
                      <div className="mt-0.5 opacity-75">
                        {activeCycle.currentUser.completionStatus === 'SKIPPED'
                          ? 'Отметка пропущена'
                          : activeCycle.currentUser.completionStatus === 'SUBMITTED'
                            ? 'Отметка заполнена'
                            : 'Ожидает заполнения'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/50 px-3 py-2">
                      <div className="font-medium">Партнёр</div>
                      <div className="mt-0.5 opacity-75">
                        {activeCycle.peer.completionStatus === 'SKIPPED'
                          ? 'Отметка пропущена'
                          : activeCycle.peer.completionStatus === 'SUBMITTED'
                            ? 'Отметка заполнена'
                            : 'Ответ ещё не готов'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/50 px-3 py-2">
                      <div className="font-medium">Сводка</div>
                      <div className="mt-0.5 opacity-75">
                        {PAIR_DATA_STATUS_LABELS[activeCycle.pair.dataStatus]}
                      </div>
                    </div>
                  </div>

                  {activeCycle?.pair.signals.length ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {activeCycle.pair.signals.map((signal) => (
                        <span key={signal.key} className="rounded-full bg-white/45 px-2.5 py-1">
                          {SIGNAL_LABELS[signal.key]}: {SIGNAL_STATUS[signal.status]}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <span className="mt-4 inline-flex w-fit rounded-full bg-white/75 px-3 py-2 text-sm font-semibold shadow-sm">
                    {primaryCopy.label}
                  </span>
                </div>
              </div>
            </Link>
        ) : (
          <Link
            href={`/pair/${pairId}`}
            className="app-tile app-tile-rose app-reveal app-menu-hero group relative min-h-[13rem]"
          >
            <div className="app-tile-content">
              <span className="mb-auto w-fit rounded-full bg-white/65 px-3 py-1 text-xs font-medium">
                Пара
              </span>
              <h1 className="app-tile-title mt-6">Текущий цикл пока недоступен</h1>
              <p className="app-tile-description">
                Откройте профиль пары или воспользуйтесь другими разделами.
              </p>
              <span className="mt-4 inline-flex w-fit rounded-full bg-white/75 px-3 py-2 text-sm font-semibold shadow-sm">
                Открыть пару
              </span>
            </div>
          </Link>
        )}

        <Link
          href="/profile"
          className="app-tile app-tile-plum app-reveal app-menu-tile min-h-[11rem]"
        >
          <div className="app-tile-content">
            <span className="app-tile-title">Мой профиль</span>
            <span className="app-tile-description">
              Личные ориентиры, состояние и настройки аккаунта.
            </span>
          </div>
        </Link>

        <Link
          href="/questionnaires"
          className="app-tile app-tile-mint app-reveal app-menu-tile min-h-[11rem]"
        >
          <div className="app-tile-content">
            <span className="app-tile-title">Анкеты</span>
            <span className="app-tile-description">
              Короткие вопросы и ваш выбор приватности для каждого ответа.
            </span>
          </div>
        </Link>

        <Link
          href="/search"
          className="app-tile app-tile-spark app-reveal app-menu-tile min-h-[11rem]"
        >
          <div className="app-tile-content">
            <span className="mb-auto w-fit rounded-full bg-white/20 px-3 py-1 text-sm text-white/95">
              Подбор партнёра
            </span>
            <span className="app-tile-title mt-5">Знакомства</span>
            <span className="app-tile-description text-white/90">
              Лента, входящие и качественные подсказки без процентов.
            </span>
          </div>
        </Link>

        <Link
          href="/couple-activity"
          className="app-tile app-tile-aura app-reveal app-menu-tile min-h-[11rem]"
        >
          <div className="app-tile-content">
            <span className="app-tile-title">Активности пары</span>
            <span className="app-tile-description">
              {activeSummary?.currentActivity
                ? `Продолжить: ${activeSummary.currentActivity.title.ru}`
                : activeRecommendation
                  ? `Рекомендация: ${activeRecommendation.activity.title.ru}`
                  : 'Текущая активность, рекомендации и история ваших шагов.'}
            </span>
          </div>
        </Link>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Дополнительные разделы">
        <Link href="/development" className="app-btn-secondary px-3 py-2">Развитие и отдых</Link>
        <Link href="/store" className="app-btn-secondary px-3 py-2">Монеты и магазин</Link>
        {pairId && <Link href="/shared-life" className="app-btn-secondary px-3 py-2">Наша общая жизнь</Link>}
        {!pairId && <Link href="/invite" className="app-btn-secondary px-3 py-2">Уже есть партнёр</Link>}
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
        {pairId && (
          <Link href="/profile/safety" className="app-btn-secondary px-3 py-2">
            Приватная безопасность
          </Link>
        )}
        <Link href="/match/inbox" className="app-btn-secondary px-3 py-2">
          Входящие знакомств
        </Link>
        <Link href="/match-card/create" className="app-btn-secondary px-3 py-2">
          Настройки знакомств
        </Link>
      </nav>
    </main>
  );
}
