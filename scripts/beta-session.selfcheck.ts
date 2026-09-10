import assert from 'node:assert/strict';
import React from 'react';
import { http, clearEmbeddedSessionBearerToken } from '@/client/api/http';
import { authApi } from '@/client/api/auth.api';
import { usersApi } from '@/client/api/users.api';
import { ApiClientError } from '@/client/api/errors';
import { announceSessionChange, SESSION_CHANGED_EVENT, sessionRevision } from '@/client/api/sessionEvents';

// Actual client modules and hook, with controlled fetch/React/EventTarget scheduling.
// This reproduces memory and lifecycle races; it does not certify browser history or Discord OAuth.
const pending = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
type JsonFixture = { value: string } | { session_token: string } | { id: string; username: string; avatar: string };
const success = (data: JsonFixture) => new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const tick = async () => { for (let index = 0; index < 16; index++) await Promise.resolve(); };
const receipt = (assertion: string) => console.log(JSON.stringify({ suite: 'beta-session', status: 'PASS', assertion, layer: 'ACTUAL_CLIENT_MODULES_REACT_EVENTTARGET_ADAPTER' }));
const revisionsKey = 'vmeste-session-revision';
const storageEvent = (key = revisionsKey) => Object.assign(new Event('storage'), { key });
const restored: Array<{ target: object; key: string; descriptor?: PropertyDescriptor }> = [];
function replace(target: object, key: string, value: object) {
  restored.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { configurable: true, writable: true, value });
}
type Cell = object | boolean | string | number | null;
const cells: Array<{ value: Cell }> = [];
const refs: Array<{ current: Cell }> = [];
const effects: Array<() => (() => void)> = [];
let cellIndex = 0, refIndex = 0, effectIndex = 0;

async function main() {
  const originalFetch = globalThis.fetch, originalUser = usersApi.getCurrentUser;
  const markers: Array<{ key: string; value: string }> = [];
  let storageAvailable = true, sessionEvents = 0;
  const windowSurface = Object.assign(new EventTarget(), {
    localStorage: { setItem: (key: string, value: string) => { if (!storageAvailable) throw new Error('STORAGE_UNAVAILABLE'); markers.push({ key, value }); } },
  });
  const documentSurface = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  replace(globalThis, 'window', windowSurface);
  replace(globalThis, 'document', documentSurface);
  windowSurface.addEventListener(SESSION_CHANGED_EVENT, () => { sessionEvents++; });
  let cleanup: (() => void) | undefined;
  try {
    const secret = crypto.randomUUID();
    let sentBearer = false;
    const recordFetch: typeof fetch = async (_input, options) => {
      sentBearer = new Headers(options?.headers).has('Authorization');
      return success({ value: 'current' });
    };
    const exchange = async () => {
      globalThis.fetch = async () => success({ session_token: secret });
      await http.post('/api/exchange-code', { code: 'synthetic-code' });
      globalThis.fetch = recordFetch;
    };
    await exchange();
    await http.get('/api/assessments/settings');
    assert.equal(sentBearer, true, 'exchange remembers embedded authorization for subsequent internal requests');
    const beforeUnrelated = sessionRevision();
    windowSurface.dispatchEvent(storageEvent('unrelated-preference'));
    assert.equal(sessionRevision(), beforeUnrelated, 'unrelated storage does not invalidate sessions');
    await http.get('/api/assessments/settings');
    assert.equal(sentBearer, true);
    const beforeEvent = sessionEvents;
    windowSurface.dispatchEvent(storageEvent());
    assert.equal(sessionRevision(), beforeUnrelated + 1);
    assert.equal(sessionEvents, beforeEvent + 1);
    await http.get('/api/assessments/settings');
    assert.equal(sentBearer, false, 'cross-tab revision must drop the remembered bearer before the next request');
    assert.ok(markers.length > 0 && markers.every(marker => marker.key === revisionsKey && /^[a-f0-9-]{36}$/.test(marker.value) && marker.value !== secret), 'storage carries opaque random markers only');
    receipt('cross-tab revision clears remembered embedded bearer; unrelated storage does not');

    const delayed = pending<Response>();
    globalThis.fetch = () => delayed.promise;
    const inFlight = http.get('/api/assessments/portfolio');
    windowSurface.dispatchEvent(storageEvent());
    delayed.resolve(success({ value: 'prior-session-result' }));
    await assert.rejects(inFlight, (error: Error) => error instanceof ApiClientError && error.code === 'SESSION_CHANGED');
    const lateExchange = pending<Response>();
    globalThis.fetch = () => lateExchange.promise;
    const exchanging = http.post('/api/exchange-code', { code: 'synthetic-late-code' });
    windowSurface.dispatchEvent(storageEvent());
    lateExchange.resolve(success({ session_token: secret }));
    await assert.rejects(exchanging, (error: Error) => error instanceof ApiClientError && error.code === 'SESSION_CHANGED');
    globalThis.fetch = recordFetch;
    await http.get('/api/assessments/settings');
    assert.equal(sentBearer, false, 'late exchange cannot resurrect a prior-session bearer');
    receipt('in-flight prior-session response and late exchange reject without bearer resurrection');

    let responseBody!: ReadableStreamDefaultController<Uint8Array>;
    globalThis.fetch = async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { responseBody = controller; } }), { status: 200 });
    const bodyReading = http.get('/api/assessments/portfolio');
    await tick();
    windowSurface.dispatchEvent(storageEvent());
    responseBody.enqueue(new TextEncoder().encode(JSON.stringify({ ok: true, data: { value: 'prior-session-body' } })));
    responseBody.close();
    await assert.rejects(bodyReading, (error: Error) => error instanceof ApiClientError && error.code === 'SESSION_CHANGED');
    receipt('session revision during response body parsing rejects stale payload');

    await exchange();
    const logoutRevision = sessionRevision();
    storageAvailable = false;
    globalThis.fetch = async () => { throw new Error('SYNTHETIC_NETWORK_FAILURE'); };
    await assert.rejects(authApi.logoutAll(), (error: Error) => error instanceof ApiClientError && error.code === 'NETWORK_ERROR');
    assert.equal(sessionRevision(), logoutRevision + 1, 'failed logout still invalidates local views');
    globalThis.fetch = recordFetch;
    await http.get('/api/assessments/settings');
    assert.equal(sentBearer, false, 'failed logout must conservatively forget in-memory authorization');
    storageAvailable = false;
    const storageDeniedRevision = sessionRevision(), storageDeniedEvents = sessionEvents;
    announceSessionChange();
    assert.equal(sessionRevision(), storageDeniedRevision + 1);
    assert.equal(sessionEvents, storageDeniedEvents + 1, 'denied browser storage must not prevent local invalidation');
    storageAvailable = true;
    receipt('logout network failure clears bearer and local revision even when storage is unavailable');

    replace(React, 'useState', <T extends Cell>(initial: T): [T, (value: T) => void] => {
      const index = cellIndex++, cell = cells[index] ?? (cells[index] = { value: initial });
      return [cell.value as T, value => { cell.value = value; }];
    });
    replace(React, 'useRef', <T extends Cell>(initial: T): { current: T } => {
      const index = refIndex++; return (refs[index] ?? (refs[index] = { current: initial })) as { current: T };
    });
    replace(React, 'useCallback', <T>(callback: T) => callback);
    replace(React, 'useEffect', (effect: () => (() => void)) => { const index = effectIndex++; effects[index] ??= effect; });
    const { useAssessmentResource } = await import('@/client/hooks/useAssessmentResource');
    let actor = 'synthetic-owner-A', readValue = 'initial', reads = 0;
    let readOverride: ((signal: AbortSignal) => Promise<{ value: string }>) | null = null;
    usersApi.getCurrentUser = async () => ({ id: actor, username: 'Synthetic', avatar: '' });
    const read = async (signal: AbortSignal) => { reads++; return readOverride ? readOverride(signal) : { value: readValue }; };
    function HookProbe() { cellIndex = 0; refIndex = 0; effectIndex = 0; return useAssessmentResource(read); }
    let state = HookProbe();
    cleanup = effects[0](); await tick(); state = HookProbe();
    assert.deepEqual(state.data, { value: 'initial' }); assert.equal(state.ownerId, actor);
    documentSurface.visibilityState = 'hidden';
    documentSurface.dispatchEvent(new Event('visibilitychange'));
    state = HookProbe();
    assert.equal(state.data, null); assert.equal(state.ownerId, null); assert.equal(state.saved, false);
    readValue = 'visible-current';
    documentSurface.visibilityState = 'visible';
    documentSurface.dispatchEvent(new Event('visibilitychange')); await tick(); state = HookProbe();
    assert.deepEqual(state.data, { value: 'visible-current' });
    windowSurface.dispatchEvent(new Event('pagehide')); state = HookProbe();
    assert.equal(state.data, null); assert.equal(state.ownerId, null);
    windowSurface.dispatchEvent(new Event('pageshow')); await tick(); state = HookProbe();
    assert.deepEqual(state.data, { value: 'visible-current' });
    actor = 'synthetic-owner-B'; readValue = 'account-B';
    windowSurface.dispatchEvent(storageEvent()); state = HookProbe();
    assert.equal(state.data, null, 'cross-tab account switch synchronously hides the previous resource');
    assert.equal(state.ownerId, null);
    await tick(); state = HookProbe();
    assert.equal(state.ownerId, actor); assert.deepEqual(state.data, { value: 'account-B' });
    receipt('actual resource hook hides on cross-tab change, hidden page and pagehide; resumes current owner only');

    let oldSignal: AbortSignal | undefined;
    const stale = pending<{ value: string }>();
    readOverride = signal => { oldSignal = signal; return stale.promise; };
    const oldReload = state.reload(); await tick();
    readOverride = null; actor = 'synthetic-owner-C'; readValue = 'account-C';
    windowSurface.dispatchEvent(storageEvent());
    assert.equal(oldSignal?.aborted, true, 'session change aborts an earlier resource request');
    await tick(); state = HookProbe();
    assert.deepEqual(state.data, { value: 'account-C' });
    stale.resolve({ value: 'account-B-late' }); await oldReload; state = HookProbe();
    assert.deepEqual(state.data, { value: 'account-C' });
    let operations = 0;
    actor = 'synthetic-owner-D';
    assert.equal(await state.run(async () => { operations++; }), false);
    assert.equal(operations, 0, 'old owner intent must never reach its write operation');
    state = HookProbe(); assert.equal(state.data, null); assert.equal(state.ownerId, null);
    receipt('actual resource hook aborts late prior-owner read and blocks stale-owner submit before operation');

    await state.reload(); state = HookProbe();
    const mutation = pending<void>(); let mutationSignal: AbortSignal | undefined;
    const saving = state.run(async (_value, signal) => { operations++; mutationSignal = signal; await mutation.promise; });
    await tick(); state = HookProbe();
    assert.equal(state.busy, true);
    assert.equal(await state.run(async () => { operations++; }), false, 'in-flight mutation lock rejects double submit');
    const beforeMutationInvalidation = operations;
    documentSurface.visibilityState = 'hidden';
    windowSurface.dispatchEvent(storageEvent()); state = HookProbe();
    assert.equal(mutationSignal?.aborted, true); assert.equal(state.data, null); assert.equal(state.saved, false);
    mutation.resolve(); assert.equal(await saving, false); state = HookProbe();
    assert.equal(operations, beforeMutationInvalidation); assert.equal(state.data, null); assert.equal(state.saved, false);
    documentSurface.visibilityState = 'visible';
    documentSurface.dispatchEvent(new Event('visibilitychange')); await tick(); state = HookProbe();
    let changingOwner = 0;
    usersApi.getCurrentUser = async () => ({ id: ++changingOwner === 1 ? 'synthetic-before' : 'synthetic-after', username: 'Synthetic', avatar: '' });
    await state.reload(); state = HookProbe();
    assert.equal(state.data, null); assert.equal(state.ownerId, null, 'before/after identity mismatch never publishes loaded data');
    usersApi.getCurrentUser = async () => ({ id: actor, username: 'Synthetic', avatar: '' });
    await state.reload(); state = HookProbe();
    documentSurface.visibilityState = 'hidden';
    globalThis.fetch = async () => { throw new Error('SYNTHETIC_NETWORK_FAILURE'); };
    await assert.rejects(authApi.logoutAll(), (error: Error) => error instanceof ApiClientError && error.code === 'NETWORK_ERROR');
    state = HookProbe(); assert.equal(state.data, null); assert.equal(state.ownerId, null); assert.equal(state.saved, false);
    receipt('actual resource hook rejects duplicate save, session-raced save and identity mismatch; failed logout hides private state');

    documentSurface.visibilityState = 'visible'; await state.reload(); state = HookProbe();
    const cancelledIdentity = pending<Awaited<ReturnType<typeof usersApi.getCurrentUser>>>();
    usersApi.getCurrentUser = () => cancelledIdentity.promise;
    let cancelledOperations = 0;
    const cancelledWrite = state.run(async () => { cancelledOperations++; });
    windowSurface.dispatchEvent(new Event('pagehide'));
    cancelledIdentity.resolve({ id: actor, username: 'Synthetic', avatar: '' });
    assert.equal(await cancelledWrite, false);
    assert.equal(cancelledOperations, 0, 'cancelled identity preflight must not reach a deferred write callback');
    usersApi.getCurrentUser = async () => ({ id: actor, username: 'Synthetic', avatar: '' });
    await state.reload(); state = HookProbe();
    receipt('cancelled identity preflight cannot enter resource write callback');

    const unmounted = pending<{ value: string }>(); let unmountedSignal: AbortSignal | undefined;
    readOverride = signal => { unmountedSignal = signal; return unmounted.promise; };
    const unmountedReload = state.reload(); await tick(); cleanup(); cleanup = undefined;
    assert.equal(unmountedSignal?.aborted, true);
    const readsAtUnmount = reads;
    windowSurface.dispatchEvent(new Event('pageshow')); windowSurface.dispatchEvent(new Event('focus'));
    windowSurface.dispatchEvent(storageEvent()); documentSurface.dispatchEvent(new Event('visibilitychange'));
    await tick(); assert.equal(reads, readsAtUnmount, 'unmounted resource listeners must not start new requests');
    unmounted.resolve({ value: 'late-unmounted' }); await unmountedReload; state = HookProbe();
    assert.equal(state.data, null, 'unmounted completion must not publish private payload');
    receipt('actual resource hook unmount aborts request, removes listeners and rejects late completion');
  } finally {
    cleanup?.(); clearEmbeddedSessionBearerToken(); globalThis.fetch = originalFetch; usersApi.getCurrentUser = originalUser;
    for (const { target, key, descriptor } of restored.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor); else Reflect.deleteProperty(target, key);
    }
  }
}
void main().catch(() => { console.error(JSON.stringify({ suite: 'beta-session', status: 'FAIL', code: 'CLIENT_SESSION_ASSERTION_FAILED' })); process.exitCode = 1; });
