'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { assessmentApi } from '@/client/api/assessment';
import { usersApi } from '@/client/api/users.api';
import { ApiClientError } from '@/client/api/errors';
import { assessmentErrorMessage } from '@/client/api/assessmentErrors';
import { createIdempotencyKey } from '@/client/api/idempotency';
import type { AssessmentPairDTO, AssessmentPairMutation } from '@/lib/dto/assessmentPair.dto';

type WithoutReceipt<T> = T extends AssessmentPairMutation ? Omit<T, 'idempotencyKey' | 'context'> : never;
export type AssessmentPairCommand = WithoutReceipt<AssessmentPairMutation>;
export function useAssessmentPair(ownerId: string) {
  const [data, setData] = useState<AssessmentPairDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const version = useRef(0);
  const lock = useRef(false);
  const context = useRef<AssessmentPairDTO['context']>(null);
  const controller = useRef<AbortController | null>(null);
  const retry = useRef<{ fingerprint: string; body: AssessmentPairMutation } | null>(null);
  const reload = useCallback(async () => {
    if (lock.current) return;
    const generation = ++version.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    context.current = null; setData(null); setError(null); setSaved(false);
    try {
      const user = await usersApi.getCurrentUser(abort.signal);
      if (user.id !== ownerId) throw new Error('ACCOUNT_CHANGED');
      const result = await assessmentApi.pair(abort.signal);
      if (!abort.signal.aborted && version.current === generation) { context.current = result.context; setData(result); }
    } catch (caught) {
      if (abort.signal.aborted || version.current !== generation) return;
      setError(assessmentErrorMessage(caught, 'Договорённости недоступны. Обновите страницу и проверьте текущий аккаунт.'));
    }
  }, [ownerId]);
  useEffect(() => {
    const versionRef = version, requestRef = controller, retryRef = retry;
    let active = true; queueMicrotask(() => { if (active) void reload(); });
    return () => { active = false; versionRef.current++; requestRef.current?.abort(); retryRef.current = null; };
  }, [reload]);
  const mutate = async (command: AssessmentPairCommand): Promise<boolean> => {
    if (lock.current || !context.current) return false;
    lock.current = true; setBusy(true); setSaved(false); setError(null);
    const generation = ++version.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const intent = { ...command, context: context.current };
    const fingerprint = JSON.stringify(intent);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, body: { ...intent, idempotencyKey: createIdempotencyKey() } };
    try {
      const user = await usersApi.getCurrentUser(abort.signal);
      if (user.id !== ownerId) { context.current = null; setData(null); retry.current = null; throw new Error('ACCOUNT_CHANGED'); }
      const result = await assessmentApi.mutatePair(retry.current!.body, abort.signal);
      if (abort.signal.aborted || version.current !== generation) return false;
      context.current = result.context; setData(result); retry.current = null; setSaved(true); return true;
    } catch (caught) {
      if (abort.signal.aborted || version.current !== generation) return false;
      if (caught instanceof ApiClientError && [401, 403, 404].includes(caught.status)) { context.current = null; setData(null); retry.current = null; }
      setError(assessmentErrorMessage(caught, 'Запись не подтверждена. Повторите ту же операцию или обновите сохранённое состояние.'));
      return false;
    } finally { if (version.current === generation) { lock.current = false; setBusy(false); } }
  };
  return { data, busy, error, saved, mutate, reload };
}
