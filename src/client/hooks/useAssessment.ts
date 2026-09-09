'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { assessmentApi } from '@/client/api/assessment';
import { usersApi } from '@/client/api/users.api';
import { ApiClientError } from '@/client/api/errors';
import { assessmentErrorMessage } from '@/client/api/assessmentErrors';
import { createIdempotencyKey } from '@/client/api/idempotency';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';

type WithoutReceipt<T> = T extends AssessmentMutation ? Omit<T, 'idempotencyKey' | 'viewerToken'> : never;
export type AssessmentCommand = WithoutReceipt<AssessmentMutation>;
export function useAssessment() {
  const [data, setData] = useState<AssessmentRunDTO | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingIdentity, setCheckingIdentity] = useState(true);
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null);
  const generation = useRef(0);
  const identityCheck = useRef(0);
  const activeOwner = useRef<string | null>(null);
  const viewerToken = useRef<string | null>(null);
  const pending = useRef(false);
  const sourceRefreshPending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const retry = useRef<{ fingerprint: string; body: AssessmentMutation } | null>(null);
  const load = useCallback(async () => {
    if (pending.current) return;
    sourceRefreshPending.current = false;
    const version = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    viewerToken.current = null;
    setData(null); setAcknowledgement(null); setError(null); setCheckingIdentity(true);
    try {
      const user = await usersApi.getCurrentUser(abort.signal);
      if (abort.signal.aborted || version !== generation.current) return;
      if (activeOwner.current !== user.id) retry.current = null;
      activeOwner.current = user.id; setOwnerId(user.id);
      const result = await assessmentApi.get(abort.signal);
      if (!abort.signal.aborted && version === generation.current) { viewerToken.current = result.viewerToken; setData(result); setCheckingIdentity(false); }
    } catch (caught) {
      if (abort.signal.aborted || version !== generation.current) return;
      activeOwner.current = null; viewerToken.current = null; setOwnerId(null); retry.current = null;
      setError(assessmentErrorMessage(caught, 'Не удалось загрузить анкету. Повторите запрос.'));
      setCheckingIdentity(false);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    const versionRef = generation;
    const identityRef = identityCheck;
    const requestRef = controller;
    const retryRef = retry;
    queueMicrotask(() => { if (mounted) void load(); });
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      const identityVersion = ++identityRef.current;
      setCheckingIdentity(true);
      void usersApi.getCurrentUser().then(user => {
        if (!mounted || identityVersion !== identityRef.current || document.visibilityState !== 'visible') return;
        if (activeOwner.current !== user.id) {
          versionRef.current++; requestRef.current?.abort(); retryRef.current = null;
          activeOwner.current = null; viewerToken.current = null; setData(null); setOwnerId(null); setAcknowledgement(null); setBusy(false);
          pending.current = false; void load();
        } else setCheckingIdentity(false);
      }).catch(caught => {
        if (!mounted || identityVersion !== identityRef.current || document.visibilityState !== 'visible') return;
        versionRef.current++; requestRef.current?.abort(); retryRef.current = null;
        activeOwner.current = null; viewerToken.current = null; setData(null); setOwnerId(null); setAcknowledgement(null);
        setBusy(false); pending.current = false; setCheckingIdentity(false); setError(assessmentErrorMessage(caught, 'Не удалось проверить текущую сессию. Обновите страницу.'));
      });
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') { identityRef.current++; setCheckingIdentity(true); } else onReturn(); };
    const onSourceChanged = () => { sourceRefreshPending.current = true; if (!pending.current) { retryRef.current = null; void load(); } };
    window.addEventListener('focus', onReturn); document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('assessment-source-changed', onSourceChanged);
    return () => { mounted = false; versionRef.current++; identityRef.current++; requestRef.current?.abort(); retryRef.current = null; window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('assessment-source-changed', onSourceChanged); };
  }, [load]);
  const mutate = async (command: AssessmentCommand): Promise<boolean> => {
    if (pending.current || !activeOwner.current || !viewerToken.current) return false;
    pending.current = true; setBusy(true); setError(null); setAcknowledgement(null);
    const version = ++generation.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const intent = { ...command, viewerToken: viewerToken.current };
    const fingerprint = JSON.stringify(intent);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, body: intent.action === 'retry' ? intent : { ...intent, idempotencyKey: createIdempotencyKey() } };
    try {
      const user = await usersApi.getCurrentUser(abort.signal);
      if (user.id !== activeOwner.current) { setData(null); setOwnerId(null); activeOwner.current = null; viewerToken.current = null; retry.current = null; setError('Аккаунт изменился. Обновите страницу.'); return false; }
      const result = await assessmentApi.mutate(retry.current!.body, abort.signal);
      if (abort.signal.aborted || version !== generation.current) return false;
      viewerToken.current = result.viewerToken; setData(result); retry.current = null;
      setAcknowledgement(command.action === 'answer' ? 'Ответ сохранён на сервере.' : command.action === 'finalize' ? 'Ответы завершены и сохранены.' : command.action === 'permission' || command.action === 'matching-permission' ? 'Разрешение сохранено.' : command.action === 'delete' ? 'Ответы удалены.' : null);
      window.dispatchEvent(new Event('profile-measurements-changed'));
      return true;
    } catch (caught) {
      if (abort.signal.aborted || version !== generation.current) return false;
      if (caught instanceof ApiClientError && [401, 403, 404].includes(caught.status)) { setData(null); setOwnerId(null); activeOwner.current = null; viewerToken.current = null; retry.current = null; }
      setError(assessmentErrorMessage(caught, 'Сохранение не подтверждено. Можно повторить тот же ответ или обновить страницу и проверить запись.'));
      return false;
    } finally { if (version === generation.current) { pending.current = false; setBusy(false); if (sourceRefreshPending.current) { retry.current = null; void load(); } } }
  };
  return { data, ownerId, error, busy, checkingIdentity, acknowledgement, mutate, reload: load };
}
