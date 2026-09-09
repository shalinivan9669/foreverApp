'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { measurementsApi } from '@/client/api/measurements.api';
import { usersApi } from '@/client/api/users.api';
import type { MeasurementMutation, MeasurementTestDTO } from '@/lib/dto/measurementTests.dto';
import type { ProfileSummaryDTO } from '@/lib/dto/factorProfile.dto';
import { ApiClientError } from '@/client/api/errors';

export function notifyMeasurementChange() {
  window.dispatchEvent(new Event('profile-measurements-changed'));
  try { localStorage.setItem('profile-measurements-revision', String(Date.now())); } catch { /* storage can be unavailable in embedded hosts */ }
}

export function useMeasurement(key: string) {
  const [data, setData] = useState<MeasurementTestDTO | null>(null);
  const [profile, setProfile] = useState<ProfileSummaryDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mutationLock = useRef(false);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await measurementsApi.get(key);
      const summary = next.status === 'FINALIZED' && next.calculation === 'READY' ? await usersApi.getProfileSummary() : null;
      if (request !== generation.current) return;
      setData(next); setProfile(summary); setError(null);
    } catch (caught) {
      if (request !== generation.current) return;
      setData(null); setProfile(null);
      setError(caught instanceof ApiClientError ? caught.message : 'Не удалось загрузить результат. Повторите запрос.');
    }
  }, [key]);
  useEffect(() => {
    const requestGeneration = generation;
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    const returned = () => { if (document.visibilityState === 'visible' && !mutationLock.current) void load(); };
    const changed = (event: StorageEvent) => { if (event.key === 'profile-measurements-revision') returned(); };
    window.addEventListener('focus', returned); window.addEventListener('storage', changed);
    document.addEventListener('visibilitychange', returned);
    return () => { active = false; requestGeneration.current++; window.removeEventListener('focus', returned); window.removeEventListener('storage', changed); document.removeEventListener('visibilitychange', returned); };
  }, [load]);
  const mutate = async (body: MeasurementMutation) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setError(null);
    const request = ++generation.current;
    try {
      const next = await measurementsApi.mutate(key, body);
      if (request !== generation.current) return;
      setData(next); notifyMeasurementChange();
      const summary = next.status === 'FINALIZED' && next.calculation === 'READY' ? await usersApi.getProfileSummary() : null;
      if (request === generation.current) setProfile(summary);
    } catch (caught) {
      if (request !== generation.current) return;
      if (caught instanceof ApiClientError && [401, 403, 404].includes(caught.status)) { setData(null); setProfile(null); }
      setError(caught instanceof ApiClientError ? caught.message : 'Запрос не завершён. Ответы могли сохраниться; обновите результат для безопасного восстановления.');
    } finally { mutationLock.current = false; setBusy(false); }
  };
  return { data, profile, error, busy, mutate, reload: load };
}
