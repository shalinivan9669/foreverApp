'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserStore } from '@/store/useUserStore';
import BackBar from '@/components/ui/BackBar';
import { pairsApi } from '@/client/api/pairs.api';
import type { PairSummaryDTO } from '@/client/viewmodels/pair.viewmodels';

type PairProfilePageClientProps = {
  pairIdFromRoute?: string;
};

type I18n = Record<string, string>;

export default function PairProfilePageClient({ pairIdFromRoute }: PairProfilePageClientProps) {
  const user = useUserStore((s) => s.user);
  const [pairId, setPairId] = useState<string | null>(pairIdFromRoute ?? null);
  const [data, setData] = useState<PairSummaryDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvingPair, setResolvingPair] = useState(false);
  const [busy, setBusy] = useState<'pause' | 'resume' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!user) {
      setPairId(null);
      setData(null);
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
  }, [pairIdFromRoute, user]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const summary = await pairsApi.getSummary(id);
      setData(summary);
    } catch {
      setData(null);
      setLoadError('Не удалось загрузить профиль пары.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pairId) {
      setData(null);
      return;
    }
    void load(pairId);
  }, [pairId, load]);

  const locale = 'ru';
  const t = (txt?: I18n) => (txt ? txt[locale] ?? txt.en ?? Object.values(txt)[0] ?? '' : '');

  const onPause = async () => {
    if (!pairId) return;
    setBusy('pause');
    try {
      await pairsApi.pausePair(pairId);
      await load(pairId);
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
    } finally {
      setBusy(null);
    }
  };

  const badgeClass =
    data?.pair.status === 'active'
      ? 'bg-green-100 text-green-700'
      : data?.pair.status === 'paused'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  const riskTop = useMemo(() => {
    const riskZones = data?.pair.passport?.riskZones ?? [];
    return riskZones.slice().sort((a, b) => b.severity - a.severity).slice(0, 3);
  }, [data]);

  if (!user) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">Нет пользователя</div>
      </main>
    );
  }

  if (resolvingPair) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">Загрузка пары...</div>
      </main>
    );
  }

  if (!pairId) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <div className="app-panel-soft app-panel-soft-solid p-4 text-sm">Пара не найдена</div>
      </main>
    );
  }

  return (
    <main className="app-shell-compact space-y-6 py-3 sm:py-4 lg:py-6">
      <BackBar title="Профиль пары" fallbackHref="/main-menu" />

      {loading && <div className="app-panel-soft app-panel-soft-solid p-3 text-sm app-muted">Загрузка...</div>}
      {!loading && loadError && <div className="app-alert app-alert-error text-sm">{loadError}</div>}

      {data && (
        <>
          <section className="app-panel app-panel-solid app-reveal p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded px-2 py-0.5 text-xs ${badgeClass}`}>{data.pair.status}</span>
              <div className="app-muted text-sm">
                с {data.pair.createdAt ? new Date(data.pair.createdAt).toLocaleDateString('ru-RU') : '...'}
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
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
                  К активностям
                </Link>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="app-panel-soft app-panel-soft-solid p-3">
                <div className="app-muted text-xs">Серия</div>
                <div className="text-lg font-semibold">{data.pair.progress?.streak ?? 0}</div>
              </div>
              <div className="app-panel-soft app-panel-soft-solid p-3">
                <div className="app-muted text-xs">Выполнено</div>
                <div className="text-lg font-semibold">{data.pair.progress?.completed ?? 0}</div>
              </div>
              <div className="app-panel-soft app-panel-soft-solid p-3">
                <div className="app-muted text-xs">Готовность / Усталость</div>
                <div className="text-lg font-semibold">
                  {(data.pair.readiness?.score ?? 0).toFixed(2)} / {(data.pair.fatigue?.score ?? 0).toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          <section className="app-panel app-panel-solid app-reveal p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Текущая активность</h3>
              <Link href="/couple-activity" className="text-sm underline">
                Открыть список
              </Link>
            </div>
            {data.currentActivity ? (
              <div className="mt-2">
                <div className="app-muted text-sm">
                  {data.currentActivity.axis.join(', ')} • d{data.currentActivity.difficulty} • i{data.currentActivity.intensity}
                </div>
                <div className="text-lg font-semibold">{t(data.currentActivity.title)}</div>
              </div>
            ) : (
              <div className="app-muted mt-2 text-sm">Сейчас нет активной активности.</div>
            )}
            <div className="mt-3 text-sm">
              Предложено: <b>{data.suggestedCount}</b>
              {data.suggestedCount === 0 && (
                <span className="app-muted ml-2">нажмите «Ещё варианты» в разделе «Предложено»</span>
              )}
            </div>
          </section>

          <section className="app-panel app-panel-solid app-reveal p-4">
            <h3 className="font-semibold">Паспорт совместимости</h3>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <div className="app-muted mb-1 text-xs">Сильные стороны</div>
                {(data.pair.passport?.strongSides ?? []).slice(0, 3).map((strong, index) => (
                  <div key={index} className="text-sm">
                    {strong.axis}: {strong.facets.join(', ')}
                  </div>
                ))}
                {!(data.pair.passport?.strongSides?.length ?? 0) && <div className="app-muted text-sm">Пока пусто</div>}
              </div>

              <div>
                <div className="app-muted mb-1 text-xs">Зоны риска</div>
                {riskTop.map((risk, index) => (
                  <div key={index} className="text-sm">
                    {risk.axis}: s{risk.severity} {risk.facets.length ? `• ${risk.facets.join(', ')}` : ''}
                  </div>
                ))}
                {!riskTop.length && <div className="app-muted text-sm">Пока пусто</div>}
              </div>

              <div>
                <div className="app-muted mb-1 text-xs">Различия уровней</div>
                {(data.pair.passport?.levelDelta ?? []).slice(0, 3).map((delta, index) => (
                  <div key={index} className="text-sm">
                    {delta.axis}: Δ{delta.delta.toFixed(2)}
                  </div>
                ))}
                {!(data.pair.passport?.levelDelta?.length ?? 0) && <div className="app-muted text-sm">Пока пусто</div>}
              </div>
            </div>
          </section>

          <section className="app-panel app-panel-solid app-reveal p-4">
            <h3 className="font-semibold">Исходная заявка</h3>
            {data.lastLike ? (
              <div className="mt-2 text-sm">
                <div className="app-muted">
                  Скор: <b>{Math.round(data.lastLike.matchScore)}%</b>{' '}
                  {data.lastLike.updatedAt ? `• ${new Date(data.lastLike.updatedAt).toLocaleString('ru-RU')}` : ''}
                </div>
                {!!data.lastLike.agreements?.length && (
                  <div className="mt-2">
                    <div className="app-muted text-xs">Согласие</div>
                    <div>{data.lastLike.agreements.map((value, index) => <span key={index}>{value ? '✅' : '❌'} </span>)}</div>
                  </div>
                )}
                {!!data.lastLike.answers?.length && (
                  <div className="mt-2">
                    <div className="app-muted text-xs">Ответы инициатора</div>
                    <div>{data.lastLike.answers.join(' • ')}</div>
                  </div>
                )}
                {data.lastLike.recipientResponse && (
                  <div className="mt-2">
                    <div className="app-muted text-xs">Ответ получателя</div>
                    <div>
                      {data.lastLike.recipientResponse.agreements.map((value, index) => (
                        <span key={index}>{value ? '✅' : '❌'} </span>
                      ))}
                    </div>
                    <div className="mt-1">{data.lastLike.recipientResponse.answers.join(' • ')}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="app-muted mt-2 text-sm">Данные заявки не найдены.</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
