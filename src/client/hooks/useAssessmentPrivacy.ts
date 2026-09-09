'use client';
import { useEffect, useRef, useState } from 'react';
import { assessmentApi } from '@/client/api/assessment';
import { assessmentErrorMessage } from '@/client/api/assessmentErrors';
import { usersApi } from '@/client/api/users.api';
import { ApiClientError } from '@/client/api/errors';
import { createIdempotencyKey } from '@/client/api/idempotency';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';
import type { AssessmentComparisonDTO, AssessmentComparisonMutation } from '@/lib/dto/assessmentComparison.dto';
import type { AssessmentPairDTO, AssessmentPairMutation } from '@/lib/dto/assessmentPair.dto';

type PrivacyView = { ownerId: string; run: AssessmentRunDTO | null; comparison: AssessmentComparisonDTO | null; pair: AssessmentPairDTO | null };
export type AssessmentPrivacyAction = 'revoke-run-matching' | 'revoke-run-pair' | 'delete-run' | 'revoke-direct-matching' | 'revoke-direct-pair' | 'delete-direct' | 'withdraw-pair';
type Request = { target: 'run'; body: AssessmentMutation } | { target: 'comparison'; body: AssessmentComparisonMutation } | { target: 'pair'; body: AssessmentPairMutation };
const optional = async <T>(request: Promise<T>): Promise<T | null> => {
  try { return await request; } catch (caught) { if (caught instanceof ApiClientError && caught.status === 404) return null; throw caught; }
};
async function readControls(signal: AbortSignal): Promise<PrivacyView> {
  const actor = await usersApi.getCurrentUser(signal);
  const [run, comparison, pair] = await Promise.all([
    optional(assessmentApi.controls(signal)), optional(assessmentApi.comparisonControls(signal)), optional(assessmentApi.pairControls(signal)),
  ]);
  const current = await usersApi.getCurrentUser(signal);
  if (current.id !== actor.id) throw new Error('ACCOUNT_CHANGED');
  return { ownerId: actor.id, run, comparison, pair };
}
function requestFor(action: AssessmentPrivacyAction, data: PrivacyView, idempotencyKey: string): Request | null {
  const run = data.run, direct = data.comparison, pair = data.pair;
  if (action === 'revoke-run-matching' || action === 'revoke-run-pair' || action === 'delete-run') {
    if (!run || run.status === 'NEW' || run.status === 'DELETED') return null;
    const operation = { viewerToken: run.viewerToken, expectedRevision: run.revision, idempotencyKey };
    return { target: 'run', body: action === 'delete-run' ? { action: 'delete', ...operation } : action === 'revoke-run-matching' ? { action: 'matching-permission', matchingUse: false, ...operation } : { action: 'permission', pairUse: false, ...operation } };
  }
  if (action === 'withdraw-pair') return pair?.context && pair.revision > 0 ? { target: 'pair', body: { action: 'revoke', context: pair.context, expectedRevision: pair.revision, idempotencyKey } } : null;
  if (!direct || direct.direct.revision === 0) return null;
  const operation = { intentToken: direct.intentToken, expectedRevision: direct.direct.revision, idempotencyKey };
  return { target: 'comparison', body: action === 'delete-direct' ? { action: 'delete-direct', ...operation } : action === 'revoke-direct-pair' ? { action: 'pair-permission', pairUse: false, ...operation } : { action: 'revoke', ...operation } };
}
export function useAssessmentPrivacy() {
  const [data, setData] = useState<PrivacyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const generation = useRef(0), lock = useRef(false);
  const active = useRef<AbortController | null>(null);
  const retry = useRef<{ fingerprint: string; request: Request } | null>(null);
  useEffect(() => {
    const version = generation, request = active, receipt = retry, locked = lock;
    const hide = () => { version.current++; request.current?.abort(); receipt.current = null; locked.current = false; setData(null); setSaved(false); setError(null); setBusy(false); };
    const visibility = () => { if (document.visibilityState === 'hidden') hide(); };
    window.addEventListener('blur', hide); document.addEventListener('visibilitychange', visibility);
    return () => { version.current++; request.current?.abort(); receipt.current = null; window.removeEventListener('blur', hide); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const load = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setData(null); setError(null); setSaved(false);
    const version = ++generation.current; active.current?.abort(); const abort = new AbortController(); active.current = abort;
    try { const result = await readControls(abort.signal); if (!abort.signal.aborted && version === generation.current) setData(result); }
    catch (caught) { if (!abort.signal.aborted && version === generation.current) setError(assessmentErrorMessage(caught, 'Не удалось открыть управление данными. Проверьте текущий аккаунт и повторите.')); }
    finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  };
  const mutate = async (action: AssessmentPrivacyAction): Promise<boolean> => {
    if (lock.current || !data) return false;
    const base = requestFor(action, data, 'pending-key'); if (!base) return false;
    const fingerprint = JSON.stringify(base);
    if (retry.current?.fingerprint !== fingerprint) {
      const request = requestFor(action, data, createIdempotencyKey()); if (!request) return false;
      retry.current = { fingerprint, request };
    }
    lock.current = true; setBusy(true); setError(null); setSaved(false);
    const version = ++generation.current; active.current?.abort(); const abort = new AbortController(); active.current = abort;
    try {
      const current = await usersApi.getCurrentUser(abort.signal);
      if (current.id !== data.ownerId) { setData(null); retry.current = null; throw new Error('ACCOUNT_CHANGED'); }
      const request = retry.current.request;
      if (request.target === 'run') await assessmentApi.mutate(request.body, abort.signal);
      else if (request.target === 'comparison') await assessmentApi.compare(request.body, abort.signal);
      else await assessmentApi.mutatePair(request.body, abort.signal);
      if (abort.signal.aborted || version !== generation.current) return false;
      retry.current = null; setData(null);
      const result = await readControls(abort.signal);
      if (abort.signal.aborted || version !== generation.current) return false;
      if (result.ownerId !== data.ownerId) throw new Error('ACCOUNT_CHANGED');
      setData(result); setSaved(true);
      return true;
    } catch (caught) {
      if (abort.signal.aborted || version !== generation.current) return false;
      setSaved(false);
      if (caught instanceof ApiClientError && [401, 403, 404].includes(caught.status)) { setData(null); retry.current = null; }
      setError(assessmentErrorMessage(caught, 'Проверьте сохранённое состояние перед повтором: запись или обновление не подтверждены.'));
      return false;
    } finally { if (version === generation.current) { lock.current = false; setBusy(false); } }
  };
  return { data, busy, error, saved, load, mutate };
}
