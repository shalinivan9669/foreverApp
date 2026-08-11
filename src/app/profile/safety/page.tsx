'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePair } from '@/client/hooks/usePair';
import {
  safetyGateApi,
  type OwnerSafetyGateDTO,
} from '@/client/api/safetyGate.api';
import ErrorView from '@/components/ui/ErrorView';

export default function SafetySettingsPage() {
  const router = useRouter();
  const {
    pairId,
    loading: pairLoading,
    error: pairError,
    refetch: refetchPair,
  } = usePair();
  const [gate, setGate] = useState<OwnerSafetyGateDTO | null>(null);
  const [loadedPairId, setLoadedPairId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const hasCurrentGate = pairId !== null && loadedPairId === pairId;
  const visibleGate = hasCurrentGate ? gate : null;
  const visibleError = hasCurrentGate ? error : null;
  const loading = pairId !== null && !hasCurrentGate;

  useEffect(() => {
    if (!pairId) return;
    const controller = new AbortController();
    safetyGateApi
      .get(pairId, controller.signal)
      .then((nextGate) => {
        if (controller.signal.aborted) return;
        setGate(nextGate);
        setError(null);
        setLoadedPairId(pairId);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadedPairId(pairId);
          setError('Не удалось загрузить приватную настройку.');
        }
      });
    return () => controller.abort();
  }, [loadAttempt, pairId]);

  const toggle = async () => {
    if (!pairId || !visibleGate) return;
    setSaving(true);
    setError(null);
    try {
      setGate(await safetyGateApi.set(pairId, !visibleGate.enabled));
    } catch {
      setError('Не удалось сохранить настройку. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="app-shell-narrow py-5 sm:py-8">
      <Link href="/profile" className="app-muted text-sm hover:text-slate-900">
        ← Назад в профиль
      </Link>
      <section className="app-panel app-panel-solid mt-4 p-5 sm:p-6">
        <div className="app-muted text-xs">Приватная настройка</div>
        <h1 className="mt-1 text-2xl font-semibold">Только нейтральные активности</h1>
        <p className="app-muted mt-3 text-sm">
          При включении система оставит только несколько спокойных форматов с низкой
          нагрузкой. Настройка не меняет оценку пары, не попадает в общую сводку и не
          сообщает партнёру причину выбора.
        </p>

        {pairLoading || loading ? (
          <p className="app-muted mt-5 text-sm">Загружаем настройку…</p>
        ) : pairError ? (
          <div className="mt-5">
            <ErrorView
              error={pairError}
              onRetry={() => void refetchPair()}
              onAuthRequired={() => router.push('/')}
            />
          </div>
        ) : !pairId ? (
          <div className="app-alert app-alert-rate mt-5 text-sm">
            Настройка доступна после создания пары.
          </div>
        ) : visibleGate ? (
          <div className="mt-5">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-4 text-sm">
              <div className="font-medium">
                {visibleGate.enabled ? 'Нейтральный режим включён' : 'Нейтральный режим выключен'}
              </div>
              <p className="app-muted mt-1">
                Вы можете изменить решение в любой момент. Свободный текст и объяснение
                причины не сохраняются.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={visibleGate.enabled}
              className="app-btn-primary mt-4 px-4 py-2 text-sm disabled:opacity-60"
              disabled={saving}
              onClick={() => void toggle()}
            >
              {saving
                ? 'Сохраняем…'
                : visibleGate.enabled
                  ? 'Выключить нейтральный режим'
                  : 'Включить нейтральный режим'}
            </button>
          </div>
        ) : null}

        {visibleError && (
          <div className="app-alert app-alert-error mt-4 text-sm" role="alert">
            <p>{visibleError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadedPairId(null);
                setLoadAttempt((attempt) => attempt + 1);
              }}
              className="app-btn-secondary mt-3 px-3 py-2 text-sm"
            >
              Повторить
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
