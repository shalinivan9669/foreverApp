'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import EmptyStateView from '@/components/ui/EmptyStateView';
import ErrorView from '@/components/ui/ErrorView';
import LoadingView from '@/components/ui/LoadingView';
import { pairsApi } from '@/client/api/pairs.api';
import { questionnairesApi } from '@/client/api/questionnaires.api';
import type { PairPassportDTO } from '@/client/api/types';
import { useApi } from '@/client/hooks/useApi';

export default function PairDiagnosticsPage() {
  const params = useParams<{ id: string }>();
  const pairId = params?.id;

  const [passport, setPassport] = useState<PairPassportDTO | null>(null);
  const [coupleQnId, setCoupleQnId] = useState<string | null>(null);

  const {
    runSafe: runDiagnosticsSafe,
    loading,
    error,
  } = useApi('pair-diagnostics');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    questionnairesApi
      .getQuestionnairesByTarget('couple', controller.signal)
      .then((list) => {
        if (!active) return;
        const first = Array.isArray(list) ? list[0] : null;
        setCoupleQnId(first?.id ?? first?._id ?? null);
      })
      .catch(() => {
        if (!active) return;
        setCoupleQnId(null);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!pairId) return;

    const diagnostics = await runDiagnosticsSafe(
      () => pairsApi.getDiagnostics(pairId),
      { loadingKey: 'pair-diagnostics' }
    );
    if (!diagnostics) return;
    setPassport(diagnostics.passport ?? null);
  }, [pairId, runDiagnosticsSafe]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ctaHref = useMemo(
    () => (coupleQnId && pairId ? `/pair/${pairId}/questionnaire/${coupleQnId}` : '#'),
    [coupleQnId, pairId]
  );

  const formatDate = (value?: string): string => (value ? new Date(value).toLocaleString('ru-RU') : '—');

  const severityBadge = (value: 1 | 2 | 3) => (
    <span
      className={`px-2 py-0.5 rounded text-xs ${
        value === 3
          ? 'bg-red-100 text-red-700'
          : value === 2
            ? 'bg-amber-100 text-amber-700'
            : 'bg-yellow-100 text-yellow-700'
      }`}
    >
      S{value}
    </span>
  );

  if (!pairId) {
    return (
      <main className="app-shell-compact py-3 sm:py-4">
        <EmptyStateView
          title="Пара не найдена"
          description="Откройте диагностику из профиля пары."
        />
      </main>
    );
  }

  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Диагностика пары</h1>
        <Link href="/main-menu" className="text-sm text-blue-600 hover:underline">
          В меню
        </Link>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
          disabled={loading}
          className="app-btn-secondary px-3 py-2 text-sm text-slate-800 disabled:opacity-60"
        >
          Обновить
        </button>
        {coupleQnId && (
          <Link href={ctaHref} className="app-btn-primary px-3 py-2 text-sm text-white">
            Пройти диагностику
          </Link>
        )}
      </div>

      {loading && !passport && <LoadingView compact label="Загрузка диагностики..." />}
      {error && (
        <ErrorView
          error={error}
          onRetry={() => {
            void refresh();
          }}
        />
      )}

      {!loading && !passport && !error && (
        <EmptyStateView
          title="Нет данных диагностики"
          description="Пройдите парную анкету, чтобы увидеть анализ."
        />
      )}

      {!loading && passport && (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">Последнее обновление: {formatDate(passport.lastDiagnosticsAt)}</div>

          <section className="space-y-2">
            <h2 className="font-semibold">Риск-зоны</h2>
            {passport.riskZones.length > 0 ? (
              passport.riskZones.map((risk, index) => (
                <div key={`${risk.axis}-${index}`} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <div className="font-medium">{risk.axis}</div>
                    {risk.facets.length > 0 && (
                      <div className="text-xs text-gray-600">facets: {risk.facets.join(', ')}</div>
                    )}
                  </div>
                  {severityBadge(risk.severity)}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">Нет выраженных рисков</div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Сильные стороны</h2>
            {passport.strongSides.length > 0 ? (
              passport.strongSides.map((strong, index) => (
                <div key={`${strong.axis}-${index}`} className="border rounded p-3">
                  <div className="font-medium">{strong.axis}</div>
                  {strong.facets.length > 0 && (
                    <div className="text-xs text-gray-600">facets: {strong.facets.join(', ')}</div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">Появятся после диагностики</div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Взаимодополнение</h2>
            {passport.complementMap.length > 0 ? (
              passport.complementMap.map((item, index) => (
                <div key={`${item.axis}-${index}`} className="border rounded p-3 text-sm">
                  <div className="font-medium">{item.axis}</div>
                  <div className="text-gray-700">
                    A покрывает B: {item.A_covers_B.length > 0 ? item.A_covers_B.join(', ') : '—'}
                  </div>
                  <div className="text-gray-700">
                    B покрывает A: {item.B_covers_A.length > 0 ? item.B_covers_A.join(', ') : '—'}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">Нет данных</div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
