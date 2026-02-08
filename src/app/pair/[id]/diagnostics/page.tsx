'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/utils/api';
import { fetchEnvelope } from '@/utils/apiClient';

type Axis = 'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche';

type Passport = {
  strongSides: { axis: Axis; facets: string[] }[];
  riskZones: { axis: Axis; facets: string[]; severity: 1 | 2 | 3 }[];
  complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[];
  levelDelta: { axis: Axis; delta: number }[];
  lastDiagnosticsAt?: string;
};

type CoupleQuestionnaire = {
  id?: string;
  _id?: string;
};

type DiagnosticsResponse = {
  pairId: string;
  passport: Passport;
};

export default function PairDiagnosticsPage() {
  const params = useParams<{ id: string }>();
  const pairId = params?.id;

  const [passport, setPassport] = useState<Passport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupleQnId, setCoupleQnId] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetchEnvelope<CoupleQuestionnaire[]>(api('/api/questionnaires?target=couple'))
      .then((list) => {
        if (!on) return;
        const first = list[0];
        setCoupleQnId(first?.id ?? first?._id ?? null);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!pairId) return;
    setLoading(true);
    setError(null);
    try {
      const diagnostics = await fetchEnvelope<DiagnosticsResponse>(api(`/api/pairs/${pairId}/diagnostics`));
      setPassport(diagnostics.passport ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [pairId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString() : '—');

  const severityBadge = (n: 1 | 2 | 3) => (
    <span
      className={`px-2 py-0.5 rounded text-xs ${
        n === 3 ? 'bg-red-100 text-red-700' : n === 2 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-100 text-yellow-700'
      }`}
    >
      S{n}
    </span>
  );

  const ctaHref = useMemo(() => (coupleQnId ? `/pair/${pairId}/questionnaire/${coupleQnId}` : '#'), [coupleQnId, pairId]);

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Диагностика пары</h1>
        <Link href="/main-menu" className="text-sm text-blue-600 hover:underline">
          В меню
        </Link>
      </div>

      <div className="flex gap-2">
        <button onClick={() => void refresh()} disabled={loading} className="px-3 py-2 rounded bg-black text-white disabled:opacity-50">
          Обновить
        </button>
        {coupleQnId && (
          <Link href={ctaHref} className="px-3 py-2 rounded bg-yellow-300 text-black">
            Пройти диагностику
          </Link>
        )}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {loading && <div className="text-sm text-gray-500">Загрузка…</div>}

      {!loading && passport && (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">Последнее обновление: {fmtDate(passport.lastDiagnosticsAt)}</div>

          <section className="space-y-2">
            <h2 className="font-semibold">Риск-зоны</h2>
            {passport.riskZones?.length ? (
              passport.riskZones.map((r, i) => (
                <div key={`${r.axis}-${i}`} className="flex items-center justify-between border rounded p-3">
                  <div>
                    <div className="font-medium">{r.axis}</div>
                    {r.facets?.length ? <div className="text-xs text-gray-600">facets: {r.facets.join(', ')}</div> : null}
                  </div>
                  {severityBadge(r.severity)}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">Нет выраженных рисков</div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Сильные стороны</h2>
            {passport.strongSides?.length ? (
              passport.strongSides.map((s, i) => (
                <div key={`${s.axis}-${i}`} className="border rounded p-3">
                  <div className="font-medium">{s.axis}</div>
                  {s.facets?.length ? <div className="text-xs text-gray-600">facets: {s.facets.join(', ')}</div> : null}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-600">Появятся после диагностики</div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-semibold">Взаимодополнение</h2>
            {passport.complementMap?.length ? (
              passport.complementMap.map((c, i) => (
                <div key={`${c.axis}-${i}`} className="border rounded p-3 text-sm">
                  <div className="font-medium">{c.axis}</div>
                  <div className="text-gray-700">A покрывает B: {c.A_covers_B?.length ? c.A_covers_B.join(', ') : '—'}</div>
                  <div className="text-gray-700">B покрывает A: {c.B_covers_A?.length ? c.B_covers_A.join(', ') : '—'}</div>
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
