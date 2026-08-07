'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePair } from '@/client/hooks/usePair';
import {
  safetyGateApi,
  type OwnerSafetyGateDTO,
} from '@/client/api/safetyGate.api';

export default function SafetySettingsPage() {
  const { pairId, loading: pairLoading } = usePair();
  const [gate, setGate] = useState<OwnerSafetyGateDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pairId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    safetyGateApi
      .get(pairId, controller.signal)
      .then(setGate)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Не удалось загрузить приватную настройку.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [pairId]);

  const toggle = async () => {
    if (!pairId || !gate) return;
    setSaving(true);
    setError(null);
    try {
      setGate(await safetyGateApi.set(pairId, !gate.enabled));
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
        ) : !pairId ? (
          <div className="app-alert app-alert-rate mt-5 text-sm">
            Настройка доступна после создания пары.
          </div>
        ) : gate ? (
          <div className="mt-5">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-4 text-sm">
              <div className="font-medium">
                {gate.enabled ? 'Нейтральный режим включён' : 'Нейтральный режим выключен'}
              </div>
              <p className="app-muted mt-1">
                Вы можете изменить решение в любой момент. Свободный текст и объяснение
                причины не сохраняются.
              </p>
            </div>
            <button
              type="button"
              className="app-btn-primary mt-4 px-4 py-2 text-sm disabled:opacity-60"
              disabled={saving}
              onClick={() => void toggle()}
            >
              {saving
                ? 'Сохраняем…'
                : gate.enabled
                  ? 'Выключить нейтральный режим'
                  : 'Включить нейтральный режим'}
            </button>
          </div>
        ) : null}

        {error && <div className="app-alert app-alert-error mt-4 text-sm">{error}</div>}
      </section>
    </main>
  );
}
