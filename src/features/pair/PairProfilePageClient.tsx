'use client';

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

  const badge =
    data?.pair.status === 'active'
      ? 'bg-green-100 text-green-700'
      : data?.pair.status === 'paused'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-gray-100 text-gray-600';

  const riskTop = useMemo(() => {
    const rz = data?.pair.passport?.riskZones ?? [];
    return rz.slice().sort((a, b) => b.severity - a.severity).slice(0, 3);
  }, [data]);

  if (!user) return <div className="p-4">Нет пользователя</div>;
  if (resolvingPair) return <div className="p-4">Загрузка пары…</div>;
  if (!pairId) return <div className="p-4">Пара не найдена</div>;

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-6">
      <BackBar title="Профиль пары" fallbackHref="/main-menu" />

      {loading && <div className="text-sm text-gray-500">Загрузка…</div>}
      {!loading && loadError && <div className="text-sm text-red-600">{loadError}</div>}

      {data && (
        <>
          <section className="rounded border p-4">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-0.5 rounded ${badge}`}>{data.pair.status}</span>
              <div className="text-sm text-gray-500">
                с {data.pair.createdAt ? new Date(data.pair.createdAt).toLocaleDateString('ru-RU') : '…'}
              </div>
              <div className="ml-auto flex gap-2">
                {data.pair.status === 'active' ? (
                  <button onClick={onPause} disabled={busy === 'pause'} className="px-3 py-2 rounded border">
                    Пауза
                  </button>
                ) : (
                  <button onClick={onResume} disabled={busy === 'resume'} className="px-3 py-2 rounded border">
                    Возобновить
                  </button>
                )}
                <a href="/couple-activity" className="px-3 py-2 rounded bg-black text-white">
                  К активностям
                </a>
              </div>
            </div>

            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <div className="rounded bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Серия</div>
                <div className="text-lg font-semibold">{data.pair.progress?.streak ?? 0}</div>
              </div>
              <div className="rounded bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Выполнено</div>
                <div className="text-lg font-semibold">{data.pair.progress?.completed ?? 0}</div>
              </div>
              <div className="rounded bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Готовность / Усталость</div>
                <div className="text-lg font-semibold">
                  {(data.pair.readiness?.score ?? 0).toFixed(2)} / {(data.pair.fatigue?.score ?? 0).toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded border p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Текущая активность</h3>
              <a href="/couple-activity" className="text-sm underline">
                Открыть список
              </a>
            </div>
            {data.currentActivity ? (
              <div className="mt-2">
                <div className="text-sm text-gray-500">
                  {data.currentActivity.axis.join(', ')}
                  {' • '}d{data.currentActivity.difficulty} • i{data.currentActivity.intensity}
                </div>
                <div className="text-lg font-semibold">{t(data.currentActivity.title)}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-500">Сейчас нет активной активности.</div>
            )}
            <div className="mt-3 text-sm">
              Предложено: <b>{data.suggestedCount}</b>
              {data.suggestedCount === 0 && (
                <span className="ml-2 text-gray-500">нажмите «Ещё варианты» в разделе «Предложено»</span>
              )}
            </div>
          </section>

          <section className="rounded border p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Паспорт совместимости</h3>
            </div>

            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">Сильные стороны</div>
                {(data.pair.passport?.strongSides ?? []).slice(0, 3).map((s, i) => (
                  <div key={i} className="text-sm">
                    {s.axis}: {s.facets.join(', ')}
                  </div>
                ))}
                {!(data.pair.passport?.strongSides?.length ?? 0) && (
                  <div className="text-sm text-gray-500">Пока пусто</div>
                )}
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Зоны риска</div>
                {riskTop.map((r, i) => (
                  <div key={i} className="text-sm">
                    {r.axis}: s{r.severity} {r.facets.length ? `• ${r.facets.join(', ')}` : ''}
                  </div>
                ))}
                {!riskTop.length && <div className="text-sm text-gray-500">Пока пусто</div>}
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">Различия уровней</div>
                {(data.pair.passport?.levelDelta ?? []).slice(0, 3).map((d, i) => (
                  <div key={i} className="text-sm">
                    {d.axis}: Δ{d.delta.toFixed(2)}
                  </div>
                ))}
                {!(data.pair.passport?.levelDelta?.length ?? 0) && (
                  <div className="text-sm text-gray-500">Пока пусто</div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded border p-4">
            <h3 className="font-semibold">Исходная заявка</h3>
            {data.lastLike ? (
              <div className="mt-2 text-sm">
                <div className="text-gray-500">
                  Скор: <b>{Math.round(data.lastLike.matchScore)}%</b>{' '}
                  {data.lastLike.updatedAt && '• ' + new Date(data.lastLike.updatedAt).toLocaleString('ru-RU')}
                </div>
                {!!data.lastLike.agreements?.length && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500">Согласие</div>
                    <div>{data.lastLike.agreements.map((v, i) => <span key={i}>{v ? '✅' : '❌'} </span>)}</div>
                  </div>
                )}
                {!!data.lastLike.answers?.length && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500">Ответы инициатора</div>
                    <div>{data.lastLike.answers.join(' • ')}</div>
                  </div>
                )}
                {data.lastLike.recipientResponse && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-500">Ответ получателя</div>
                    <div>
                      {data.lastLike.recipientResponse.agreements.map((v, i) => (
                        <span key={i}>{v ? '✅' : '❌'} </span>
                      ))}
                    </div>
                    <div className="mt-1">{data.lastLike.recipientResponse.answers.join(' • ')}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-500 mt-2">Данные заявки не найдены.</div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
