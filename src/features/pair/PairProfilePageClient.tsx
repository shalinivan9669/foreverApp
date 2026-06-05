'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import BackBar from '@/components/ui/BackBar';
import PairWeeklyCheckInPanel from '@/components/checkins/PairWeeklyCheckInPanel';
import InsightsList from '@/components/profile/InsightsList';
import { pairsApi } from '@/client/api/pairs.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import type { InsightDTO } from '@/client/api/types';
import type { PairSummaryDTO } from '@/client/viewmodels/pair.viewmodels';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';

type PairProfilePageClientProps = {
  pairIdFromRoute?: string;
};

type I18n = Record<string, string>;
type PairMember = PairSummaryDTO['members'][number];
type PairDiagnostics = PairSummaryDTO['diagnostics'];

const AXIS_LABELS: Record<string, string> = {
  communication: 'Коммуникация',
  domestic: 'Быт',
  personalViews: 'Личные взгляды',
  finance: 'Финансы',
  sexuality: 'Близость',
  psyche: 'Ресурс',
};

const FACET_LABELS: Record<string, string> = {
  avoidance: 'сложные темы откладываются',
  directness: 'разный темп прямого разговора',
  fairness: 'ощущение справедливости',
  load: 'распределение нагрузки',
  load_balance: 'баланс нагрузки',
  load_awareness: 'видимость бытовых задач',
  domestic_fairness: 'справедливость в быту',
  invisible_labor: 'невидимая нагрузка',
  weekly_recovered: 'ресурс восстановился',
  weekly_unresolved_topic: 'осталась нерешённая тема',
};

const PAIR_STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  paused: 'На паузе',
  ended: 'Завершена',
};

const OVERALL_TITLES: Record<NonNullable<PairDiagnostics['overall']>['status'], string> = {
  strong: 'Состояние пары выглядит устойчивым',
  neutral: 'Состояние пары без выраженного перекоса',
  risk: 'Есть зоны напряжения, лучше не игнорировать',
  insufficient_data: 'Пока мало данных для честного вывода',
};

const SEVERITY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'слабый сигнал',
  2: 'средний риск',
  3: 'высокий риск',
};

const clamp01 = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const formatDate = (value?: string): string =>
  value ? new Date(value).toLocaleDateString('ru-RU') : 'дата не указана';

const formatDateTime = (value?: string): string =>
  value ? new Date(value).toLocaleString('ru-RU') : '';

const formatPercent = (value?: number): string => `${Math.round(clamp01(value) * 100)}%`;

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

const hasPassportData = (diagnostics: PairDiagnostics): boolean =>
  Boolean(
    diagnostics.lastDiagnosticsAt ||
      diagnostics.strongSides.length ||
      diagnostics.riskZones.length ||
      diagnostics.complementMap.length ||
      diagnostics.levelDelta.length
  );

const readableFacets = (facets: string[], fallback: string): string => {
  const labels = facets
    .map((facet) => FACET_LABELS[facet])
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);
  return labels.length ? labels.join(', ') : fallback;
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

function MetricBar({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone: 'readiness' | 'fatigue';
}) {
  const percent = Math.round(clamp01(value) * 100);
  const color = tone === 'readiness' ? 'bg-emerald-500' : 'bg-amber-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="app-muted">{label}</span>
        <span className="font-medium">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function PairProfilePageClient({ pairIdFromRoute }: PairProfilePageClientProps) {
  const { data: currentUser } = useCurrentUser();
  const [pairId, setPairId] = useState<string | null>(pairIdFromRoute ?? null);
  const [data, setData] = useState<PairSummaryDTO | null>(null);
  const [insights, setInsights] = useState<InsightDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [resolvingPair, setResolvingPair] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'resume' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!currentUser) {
      setPairId(null);
      setData(null);
      setInsights([]);
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
    setInsights([]);
    setInsightsError(null);
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
    setInsightsLoading(true);
    try {
      const result = await pairsApi.getInsights(id);
      setInsights(result.insights ?? []);
    } catch {
      setInsights([]);
      setInsightsError('Инсайты пары сейчас недоступны.');
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pairId) {
      setData(null);
      setInsights([]);
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

  const riskTop = useMemo(
    () => (data?.diagnostics.riskZones ?? []).slice().sort((a, b) => b.severity - a.severity).slice(0, 3),
    [data]
  );
  const strongTop = useMemo(() => (data?.diagnostics.strongSides ?? []).slice(0, 3), [data]);
  const complementTop = useMemo(() => (data?.diagnostics.complementMap ?? []).slice(0, 3), [data]);
  const levelDeltaTop = useMemo(
    () =>
      (data?.diagnostics.levelDelta ?? [])
        .slice()
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3),
    [data]
  );

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
          <Link href="/search" className="app-btn-primary mt-4 inline-flex px-4 py-2 text-sm">
            Перейти к поиску
          </Link>
        </section>
      </main>
    );
  }

  const pairStatus = data?.pair.status;
  const pairStatusLabel = pairStatus ? PAIR_STATUS_LABELS[pairStatus] ?? pairStatus : '...';
  const peerName = memberName(data?.peer);
  const overall = data?.diagnostics.overall;
  const overallStatus = overall?.status ?? 'insufficient_data';
  const lowConfidence = !overall || overall.confidence < 0.35;
  const dashboardReady = Boolean(data);
  const passportHasData = data ? hasPassportData(data.diagnostics) : false;
  const members = data?.members.length ? data.members : [];

  return (
    <main className="app-shell-compact space-y-5 py-3 sm:py-4 lg:py-6">
      <BackBar title="Профиль пары" fallbackHref="/main-menu" />

      {loading && (
        <div className="app-panel-soft app-panel-soft-solid p-3 text-sm app-muted">
          Загружаем dashboard пары...
        </div>
      )}
      {!loading && loadError && <div className="app-alert app-alert-error text-sm">{loadError}</div>}

      {dashboardReady && data && (
        <>
          <section className="app-panel app-panel-solid app-reveal p-4 sm:p-5">
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
                  <h1 className="text-2xl font-semibold leading-tight">Dashboard пары</h1>
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
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
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

          <section className="app-panel app-panel-solid app-reveal p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="min-w-0 flex-1">
                <div className="app-muted text-xs">Состояние пары</div>
                <h2 className="mt-1 text-xl font-semibold">{OVERALL_TITLES[overallStatus]}</h2>
                <p className="app-muted mt-2 text-sm">
                  {lowConfidence
                    ? 'Данных пока мало, поэтому вывод лучше воспринимать как предварительный сигнал.'
                    : 'По ответам уже виден общий контур. Это не окончательный вывод, а подсказка для следующего шага.'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white/70 p-3 md:w-48">
                <div className="app-muted text-xs">Оценка</div>
                <div className="mt-1 text-2xl font-semibold">
                  {lowConfidence ? 'мало данных' : formatPercent(overall?.score)}
                </div>
                <div className="app-muted mt-1 text-xs">уверенность: {formatPercent(overall?.confidence)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <MetricBar label="Готовность" value={data.pair.readiness?.score} tone="readiness" />
              <MetricBar label="Усталость" value={data.pair.fatigue?.score} tone="fatigue" />
            </div>
          </section>

          <section className="app-panel app-panel-solid app-reveal border-l-4 border-l-rose-300 p-4 sm:p-5">
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

          <section className="app-panel app-panel-solid app-reveal p-4 sm:p-5">
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

          <section id="weekly-checkin" className="app-reveal scroll-mt-4">
            <PairWeeklyCheckInPanel
              pairId={pairId}
              pairStatus={data.pair.status}
              onSummaryChanged={() => load(pairId)}
            />
          </section>

          <section className="app-panel app-panel-solid app-reveal p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="app-muted text-xs">Паспорт совместимости</div>
                <h2 className="mt-1 text-xl font-semibold">Сильные стороны, риски и различия</h2>
              </div>
              <Link href={`/pair/${pairId}/diagnostics`} className="app-btn-secondary px-3 py-2 text-sm">
                Диагностика
              </Link>
            </div>

            {!passportHasData ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-sm">
                <div className="font-medium">Пока мало данных</div>
                <p className="app-muted mt-1">
                  Пройдите диагностику пары, чтобы увидеть сильные стороны, риски и взаимодополнение.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Сильные стороны</h3>
                  {strongTop.length ? (
                    strongTop.map((strong) => (
                      <div key={strong.axis} className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                        <div className="font-medium">{axisLabel(strong.axis)}</div>
                        <p className="app-muted mt-1">
                          {readableFacets(strong.facets, 'по ответам видно общий ресурс в этой зоне')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="app-muted text-sm">Сильные стороны появятся после дополнительных ответов.</p>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Риск-зоны</h3>
                  {riskTop.length ? (
                    riskTop.map((risk) => (
                      <div key={`${risk.axis}-${risk.severity}`} className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{axisLabel(risk.axis)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs ${severityClass(risk.severity)}`}>
                            {SEVERITY_LABELS[risk.severity]}
                          </span>
                        </div>
                        <p className="app-muted mt-1">
                          {readableFacets(risk.facets, 'лучше обсудить ожидания заранее')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="app-muted text-sm">Выраженных риск-зон пока не видно.</p>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Взаимодополнение</h3>
                  {complementTop.length ? (
                    complementTop.map((item) => (
                      <div key={item.axis} className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                        <div className="font-medium">{axisLabel(item.axis)}</div>
                        <p className="app-muted mt-1">
                          {readableFacets(
                            [...item.A_covers_B, ...item.B_covers_A],
                            'разные подходы могут дополнять друг друга при ясных правилах'
                          )}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="app-muted text-sm">Взаимодополнение появится, когда данных станет больше.</p>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Различия уровней</h3>
                  {levelDeltaTop.length ? (
                    levelDeltaTop.map((delta) => (
                      <div key={delta.axis} className="rounded-lg border border-slate-100 bg-white/70 p-3 text-sm">
                        <div className="font-medium">{axisLabel(delta.axis)}</div>
                        <p className="app-muted mt-1">Разница: {formatPercent(Math.abs(delta.delta))}</p>
                      </div>
                    ))
                  ) : (
                    <p className="app-muted text-sm">Заметных различий уровней пока не видно.</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="app-panel app-panel-solid app-reveal p-4 sm:p-5">
            <div className="app-muted text-xs">Pair insights</div>
            <h2 className="mt-1 text-xl font-semibold">Наблюдения по паре</h2>
            <div className="mt-3">
              {insightsLoading ? (
                <div className="app-muted text-sm">Загружаем инсайты...</div>
              ) : insights.length ? (
                <InsightsList items={insights.slice(0, 3)} pairId={pairId} />
              ) : (
                <div className="app-muted text-sm">
                  Пока недостаточно данных для инсайтов. После диагностики, активности или weekly check-in здесь появятся наблюдения.
                </div>
              )}
              {insightsError && <div className="app-muted mt-2 text-xs">{insightsError}</div>}
            </div>
          </section>

          <section className="app-panel app-panel-solid app-reveal p-4 sm:p-5">
            <div className="app-muted text-xs">С чего началась пара</div>
            <h2 className="mt-1 text-lg font-semibold">Исходное совпадение</h2>
            {data.lastLike ? (
              <div className="mt-3 text-sm">
                <div className="app-muted">
                  Скор совпадения: <b>{Math.round(data.lastLike.matchScore)}%</b>{' '}
                  {data.lastLike.updatedAt ? `• ${formatDateTime(data.lastLike.updatedAt)}` : ''}
                </div>
                {!!data.lastLike.agreements?.length && (
                  <div className="mt-3">
                    <div className="app-muted text-xs">Согласие инициатора</div>
                    <div>{data.lastLike.agreements.map((value) => (value ? 'да' : 'нет')).join(' • ')}</div>
                  </div>
                )}
                {!!data.lastLike.answers?.length && (
                  <div className="mt-3">
                    <div className="app-muted text-xs">Ответы инициатора</div>
                    <div>{data.lastLike.answers.join(' • ')}</div>
                  </div>
                )}
                {data.lastLike.recipientResponse && (
                  <div className="mt-3">
                    <div className="app-muted text-xs">Ответ получателя</div>
                    <div>
                      {data.lastLike.recipientResponse.agreements.map((value) => (value ? 'да' : 'нет')).join(' • ')}
                    </div>
                    <div className="mt-1">{data.lastLike.recipientResponse.answers.join(' • ')}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="app-muted mt-3 text-sm">Данные исходного совпадения не найдены.</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
