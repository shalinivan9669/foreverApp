'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usersApi } from '@/client/api/users.api';
import { ApiClientError } from '@/client/api/errors';
import { assessmentErrorMessage } from '@/client/api/assessmentErrors';
import { SESSION_CHANGED_EVENT } from '@/client/api/sessionEvents';

/** Private resources are invalidated before history/actor changes and re-read under the current session. */
export function useAssessmentResource<T>(read: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const generation = useRef(0), lock = useRef(false);
  const owner = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const readCurrent = useCallback(async (signal: AbortSignal) => {
    const before = await usersApi.getCurrentUser(signal);
    const value = await read(signal);
    const after = await usersApi.getCurrentUser(signal);
    if (before.id !== after.id) throw new ApiClientError({ status: 401, code: 'SESSION_CHANGED', message: 'Account changed' });
    return { ownerId: before.id, value };
  }, [read]);
  const reload = useCallback(async () => {
    if (lock.current) return;
    const current = ++generation.current;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setData(null); setSaved(false); setError(null); setBusy(true);
    try {
      const result = await readCurrent(abort.signal);
      if (current !== generation.current || abort.signal.aborted) return;
      owner.current = result.ownerId; setOwnerId(result.ownerId); setData(result.value);
    } catch (caught) {
      if (current !== generation.current || abort.signal.aborted) return;
      owner.current = null; setOwnerId(null);
      setError(assessmentErrorMessage(caught, 'Не удалось загрузить сохранённое. Проверьте сессию и повторите.'));
    } finally { if (current === generation.current) setBusy(false); }
  }, [readCurrent]);
  useEffect(() => {
    let mounted = true;
    const version = generation, controller = request, locked = lock, actor = owner;
    const hide = () => {
      version.current++; controller.current?.abort(); locked.current = false; actor.current = null;
      flushSync(() => { setData(null); setOwnerId(null); setSaved(false); setBusy(false); });
    };
    const resume = () => { if (document.visibilityState === 'visible') void reload(); };
    const sessionChanged = () => { hide(); queueMicrotask(() => { if (mounted) resume(); }); };
    const focus = () => {
      if (!actor.current) { resume(); return; }
      const captured = version.current;
      void usersApi.getCurrentUser().then(user => { if (captured === version.current && actor.current !== user.id) { hide(); resume(); } }).catch(() => { if (captured === version.current) hide(); });
    };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); else resume(); };
    queueMicrotask(() => { if (mounted) void reload(); });
    window.addEventListener('pagehide', hide); window.addEventListener('pageshow', resume);
    window.addEventListener(SESSION_CHANGED_EVENT, sessionChanged); window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted = false; version.current++; controller.current?.abort();
      window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', resume);
      window.removeEventListener(SESSION_CHANGED_EVENT, sessionChanged); window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [reload]);
  const run = async (operation: (value: T, signal: AbortSignal) => Promise<void>): Promise<boolean> => {
    if (lock.current || !data || !owner.current) return false;
    lock.current = true; setBusy(true); setError(null); setSaved(false);
    const current = ++generation.current, expectedOwner = owner.current;
    request.current?.abort(); const abort = new AbortController(); request.current = abort;
    try {
      const actor = await usersApi.getCurrentUser(abort.signal);
      if (current !== generation.current || abort.signal.aborted) return false;
      if (actor.id !== expectedOwner) throw new ApiClientError({ status: 401, code: 'SESSION_CHANGED', message: 'Account changed' });
      await operation(data, abort.signal);
      if (current !== generation.current || abort.signal.aborted) return false;
      const result = await readCurrent(abort.signal);
      if (current !== generation.current || abort.signal.aborted || result.ownerId !== expectedOwner) return false;
      setData(result.value); setSaved(true); window.dispatchEvent(new Event('profile-measurements-changed'));
      return true;
    } catch (caught) {
      if (current !== generation.current || abort.signal.aborted) return false;
      if (caught instanceof ApiClientError && [401, 403, 404].includes(caught.status)) { setData(null); setOwnerId(null); owner.current = null; }
      setError(assessmentErrorMessage(caught, 'Сохранение не подтверждено. Введённое сохранено в форме; повторите или обновите запись.'));
      return false;
    } finally { if (current === generation.current) { lock.current = false; setBusy(false); } }
  };
  return { data, ownerId, busy, error, saved, reload, run };
}
