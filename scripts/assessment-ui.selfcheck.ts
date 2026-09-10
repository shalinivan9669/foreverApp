import assert from 'node:assert/strict';
import React from 'react';
import { assessmentApi } from '@/client/api/assessment';
import { usersApi } from '@/client/api/users.api';
import { ApiClientError } from '@/client/api/errors';
import type { AssessmentMutation, AssessmentRunDTO } from '@/lib/dto/assessment.dto';

// Execute the actual hook. Only React state/effect plumbing and API completion
// timing are adapted here; this is not browser or database acceptance evidence.
type Cell = object | boolean | string | null;
const cells: Array<{ value: Cell }> = [];
function currentRunState(): { revision: number; status: string } {
  const value = cells[0].value;
  assert.ok(value !== null && typeof value === 'object' && 'revision' in value && typeof value.revision === 'number' && 'status' in value && typeof value.status === 'string', 'the current hook state must contain a loaded assessment run');
  return { revision: value.revision, status: value.status };
}
const descriptors: Array<{ key: string; descriptor?: PropertyDescriptor }> = [];
const effects: Array<() => (() => void)> = [];
const hook = (key: string, value: object) => {
  descriptors.push({ key, descriptor: Object.getOwnPropertyDescriptor(React, key) });
  Object.defineProperty(React, key, { value, configurable: true, writable: true });
};
const pending = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const dto = (revision: number): AssessmentRunDTO => ({
  viewerToken: 'synthetic-server-viewer-token',
  publication: { id: 'dom-s07-household-pilot', version: '1.0.0-draft', title: 'Synthetic', status: 'DRAFT', policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED' },
  status: 'DRAFT', revision, calculation: 'NOT_STARTED', period: null, pairUse: false, matchingUse: false, permissionRevision: 0,
  answers: [], items: [], presentation: null, profile: null,
});
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function main() {
  const originalApi = { ...assessmentApi }, originalUser = usersApi.getCurrentUser;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const testDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  let cleanup: (() => void) | undefined;
  hook('useState', <T extends Cell>(initial: T): [T, (value: T) => void] => {
    const cell = { value: initial as Cell }; cells.push(cell); return [initial, value => { cell.value = value; }];
  });
  hook('useRef', <T>(initial: T) => ({ current: initial }));
  hook('useCallback', <T>(callback: T) => callback);
  hook('useEffect', (effect: () => (() => void)) => { effects.push(effect); });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: testDocument });
  try {
    const { useAssessment } = await import('@/client/hooks/useAssessment');
    function HookProbe() { return useAssessment(); }
    const state = HookProbe();
    let actor = 'synthetic-A';
    usersApi.getCurrentUser = async () => ({ id: actor, username: 'Synthetic', avatar: '' });
    assessmentApi.get = async () => dto(1);
    await state.reload();
    assert.equal(currentRunState().revision, 1);
    assert.equal(cells[1].value, 'synthetic-A');
    const requests: AssessmentMutation[] = [];
    assessmentApi.mutate = async body => { requests.push(body); throw new Error('synthetic network unavailable'); };
    const command = { action: 'answer' as const, expectedRevision: 1, presentationId: 'synthetic-presentation', response: { kind: 'MISSING' as const, reason: 'SKIPPED' as const } };
    assert.equal(await state.mutate(command), false);
    assert.equal(cells[5].value, null, 'failure must not be shown as saved');
    assert.match(String(cells[2].value), /не подтверждено/);
    assessmentApi.mutate = async body => { requests.push(body); return dto(2); };
    assert.equal(await state.mutate(command), true);
    assert.deepEqual(requests[0], requests[1], 'same failed mutation reuses its exact idempotent request');
    assert.equal(requests[0].viewerToken, dto(1).viewerToken, 'POST echoes the actual server viewer intent token');
    assert.match(String(cells[5].value), /сохранён на сервере/);
    assert.equal(currentRunState().revision, 2);
    const slow = pending<AssessmentRunDTO>();
    assessmentApi.mutate = async () => slow.promise;
    const saving = state.mutate({ action: 'matching-permission', expectedRevision: 2, matchingUse: true });
    await tick();
    assert.equal(cells[3].value, true);
    assert.equal(await state.mutate({ action: 'start' }), false, 'concurrent mutation is locked');
    slow.resolve(dto(3)); await saving;
    assert.equal(cells[3].value, false);
    assert.equal(cells[5].value, 'Разрешение сохранено.');
    const old = pending<AssessmentRunDTO>();
    let reads = 0;
    assessmentApi.get = () => ++reads === 1 ? old.promise : Promise.resolve(dto(5));
    const stale = state.reload(); await tick();
    const current = state.reload(); await current;
    old.resolve(dto(4)); await stale;
    assert.equal(currentRunState().revision, 5, 'late read cannot replace latest state');
    actor = 'synthetic-B';
    let writes = 0; assessmentApi.mutate = async () => { writes++; return dto(8); };
    assert.equal(await state.mutate({ action: 'start' }), false);
    assert.equal(writes, 0, 'changed actor must not submit pending account A intent');
    assert.equal(cells[0].value, null); assert.equal(cells[1].value, null); assert.equal(cells[5].value, null);
    assessmentApi.get = async () => dto(10); await state.reload();
    assert.equal(cells[1].value, 'synthetic-B');
    assessmentApi.mutate = async () => { throw new ApiClientError({ status: 401, code: 'AUTH_REQUIRED', message: 'Session required' }); };
    await state.mutate({ action: 'start' });
    assert.equal(cells[0].value, null); assert.equal(cells[1].value, null); assert.equal(cells[5].value, null);
    cleanup = effects[0](); await tick();
    assessmentApi.get = async () => ({ ...dto(10), status: 'FINALIZED' }); await state.reload();
    assert.equal(currentRunState().status, 'FINALIZED');
    let sourceReads = 0;
    assessmentApi.get = async () => { sourceReads++; return dto(11); };
    window.dispatchEvent(new Event('assessment-source-changed')); await tick();
    assert.equal(sourceReads, 1, 'successful pair observation refreshes the actual source without unloading the document');
    assert.equal(currentRunState().revision, 11);
    assert.equal(currentRunState().status, 'DRAFT');
    const concurrentWrite = pending<AssessmentRunDTO>();
    assessmentApi.mutate = () => concurrentWrite.promise;
    const savingDuringObservation = state.mutate({ action: 'matching-permission', expectedRevision: 11, matchingUse: true }); await tick();
    assessmentApi.get = async () => { sourceReads++; return dto(13); };
    window.dispatchEvent(new Event('assessment-source-changed'));
    assert.equal(sourceReads, 1, 'source refresh waits for an in-flight own write');
    concurrentWrite.resolve({ ...dto(12), status: 'FINALIZED' }); await savingDuringObservation; await tick();
    assert.equal(sourceReads, 2, 'the source-change event is not lost while another mutation is pending');
    assert.equal(currentRunState().revision, 13);
    const earlierIdentity = pending<Awaited<ReturnType<typeof usersApi.getCurrentUser>>>();
    const laterIdentity = pending<Awaited<ReturnType<typeof usersApi.getCurrentUser>>>();
    let identityReads = 0;
    usersApi.getCurrentUser = () => ++identityReads === 1 ? earlierIdentity.promise : laterIdentity.promise;
    window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('focus'));
    earlierIdentity.resolve({ id: actor, username: 'Synthetic', avatar: '' }); await tick();
    assert.equal(cells[4].value, true, 'older focus identity result cannot reveal data while latest verification is pending');
    testDocument.visibilityState = 'hidden'; testDocument.dispatchEvent(new Event('visibilitychange'));
    laterIdentity.resolve({ id: actor, username: 'Synthetic', avatar: '' }); await tick();
    assert.equal(cells[4].value, true, 'a pending focus verification cannot reveal account data after the tab becomes hidden');
    testDocument.visibilityState = 'visible';
    usersApi.getCurrentUser = async () => ({ id: actor, username: 'Synthetic', avatar: '' });
    await state.reload();
    window.dispatchEvent(new Event('pagehide'));
    assert.equal(cells[0].value, null, 'BETA-003 / INT-031: pagehide clears owner data before a bfcache snapshot');
    assert.equal(cells[4].value, true, 'BETA-003 / INT-031: restored history remains hidden until revalidation');
    actor = 'synthetic-A';
    assessmentApi.get = async () => { actor = 'synthetic-B'; return dto(20); };
    await state.reload();
    assert.equal(cells[0].value, null, 'cookie-only actor change during GET is rejected by the second identity read');
    assert.equal(cells[1].value, null);
    process.stdout.write(`${JSON.stringify({ suite: 'assessment-ui', status: 'passed', assertion: 'owner sandwich rejects cookie-only actor change during actual hook GET' })}\n`);
    assessmentApi.get = async () => dto(21); await state.reload();
    assessmentApi.mutate = async () => { actor = 'synthetic-C'; return dto(22); };
    assert.equal(await state.mutate({ action: 'start' }), false);
    assert.equal(cells[0].value, null); assert.equal(cells[5].value, null);
    process.stdout.write(`${JSON.stringify({ suite: 'assessment-ui', status: 'passed', assertion: 'owner sandwich rejects cookie-only actor change during actual hook mutation response' })}\n`);
    await state.reload();
    const cancelledIdentity = pending<Awaited<ReturnType<typeof usersApi.getCurrentUser>>>();
    usersApi.getCurrentUser = () => cancelledIdentity.promise;
    let cancelledWrites = 0;
    assessmentApi.mutate = async () => { cancelledWrites++; return dto(23); };
    const cancelledWrite = state.mutate({ action: 'start' });
    window.dispatchEvent(new Event('pagehide'));
    cancelledIdentity.resolve({ id: actor, username: 'Synthetic', avatar: '' });
    assert.equal(await cancelledWrite, false);
    assert.equal(cancelledWrites, 0, 'cancelled preflight cannot call the assessment write transport');
    process.stdout.write(`${JSON.stringify({ suite: 'assessment-ui', status: 'passed', assertion: 'cancelled identity preflight cannot enter assessment write transport' })}\n`);
    process.stdout.write(`${JSON.stringify({ suite: 'assessment-ui', status: 'passed', checks: 42, scope: 'REAL_HOOK_WITH_REACT_AND_API_ADAPTERS_NOT_BROWSER' })}\n`);
  } finally {
    cleanup?.();
    Object.assign(assessmentApi, originalApi); usersApi.getCurrentUser = originalUser;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
    for (const { key, descriptor } of descriptors.reverse()) if (descriptor) Object.defineProperty(React, key, descriptor); else Reflect.deleteProperty(React, key);
  }
}
void main().catch((error: Error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
