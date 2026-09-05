import assert from 'node:assert/strict';
import React from 'react';
import { http } from '@/client/api/http';
import { ApiClientError, type UiErrorState } from '@/client/api/errors';
import { useUiStore } from '@/client/stores/useUiStore';

// Execute the real useApi hook without a DOM. The small React adapter records
// state setters and supplies external-store snapshots; request logic is not mocked.
const cells: Array<{ value: boolean | UiErrorState | null }> = [];
const recordedError = (): UiErrorState | null => {
  const value = cells[1]?.value;
  return value && typeof value === 'object' ? value : null;
};
const originals: Array<{ key: string; descriptor?: PropertyDescriptor }> = [];
const stubHook = (key: string, value: object) => {
  originals.push({ key, descriptor: Object.getOwnPropertyDescriptor(React, key) });
  Object.defineProperty(React, key, { value, configurable: true, writable: true });
};
const pending = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const success = () => new Response(JSON.stringify({ ok: true, data: { value: 'current' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const main = async () => {
  const originalFetch = globalThis.fetch;
  const initialUi = useUiStore.getState();
  stubHook('useState', <T extends boolean | UiErrorState | null>(initial: T): [T, (value: T) => void] => {
    const cell = { value: initial as boolean | UiErrorState | null }; cells.push(cell);
    return [initial, (value: T) => { cell.value = value; }];
  });
  stubHook('useRef', <T>(value: T) => ({ current: value }));
  stubHook('useCallback', <T>(callback: T) => callback);
  stubHook('useDebugValue', () => {});
  stubHook('useSyncExternalStore', <T>(_subscribe: object, getSnapshot: () => T): T => getSnapshot());
  try {
    const { useApi } = await import('@/client/hooks/useApi');
    function HookProbe() { return useApi('request-race-selfcheck'); }
    const api = HookProbe();
    const requests: Array<ReturnType<typeof pending<Response>>> = [];
    globalThis.fetch = (_input, options) => {
      const request = pending<Response>(); requests.push(request);
      options?.signal?.addEventListener('abort', () => request.reject(new DOMException('Cancelled', 'AbortError')), { once: true });
      return request.promise;
    };
    useUiStore.getState().setLastError(null);
    const firstController = new AbortController();
    const first = api.runSafe(() => http.get('/api/pairs/status', { signal: firstController.signal }));
    firstController.abort();
    const current = api.runSafe(() => http.get<{ value: string }>('/api/pairs/status'));
    await first;
    assert.equal(cells[0].value, true, 'cancelled earlier run must not clear loading of the replacement');
    assert.equal(cells[1].value, null, 'StrictMode cancellation must not become a visible request failure');
    assert.equal(useUiStore.getState().lastError, null, 'cancelled request must not set global error');
    assert.equal(useUiStore.getState().loadingByKey['request-race-selfcheck'], true);
    requests[1].resolve(success());
    assert.deepEqual(await current, { value: 'current' });
    assert.equal(cells[0].value, false);
    assert.equal(cells[1].value, null);

    const stale = pending<number>();
    const latest = pending<number>();
    const oldRun = api.runSafe(() => stale.promise);
    const latestRun = api.runSafe(() => latest.promise);
    latest.resolve(2);
    assert.equal(await latestRun, 2);
    stale.reject(new ApiClientError({ status: 0, code: 'NETWORK_ERROR', message: 'late old failure' }));
    await oldRun;
    assert.equal(cells[1].value, null, 'late failure of an older run must not replace successful current state');
    assert.equal(useUiStore.getState().lastError, null);

    const otherKey = pending<number>();
    const currentKey = pending<number>();
    const otherKeyRun = api.runSafe(() => otherKey.promise, { loadingKey: 'older-key' });
    const currentKeyRun = api.runSafe(() => currentKey.promise, { loadingKey: 'current-key' });
    otherKey.resolve(1);
    await otherKeyRun;
    assert.equal(useUiStore.getState().loadingByKey['older-key'], false, 'different older loading key must be released');
    assert.equal(useUiStore.getState().loadingByKey['current-key'], true);
    assert.equal(cells[0].value, true);
    currentKey.resolve(2);
    await currentKeyRun;

    // Abort can happen after response headers, while response.json reads its body.
    globalThis.fetch = async (_input, options) => new Response(new ReadableStream({ start(controller) {
      options?.signal?.addEventListener('abort', () => controller.error(new DOMException('Cancelled body', 'AbortError')), { once: true });
    } }), { status: 200 });
    const bodyController = new AbortController();
    const bodyRead = http.get('/api/pairs/me', { signal: bodyController.signal });
    await Promise.resolve();
    bodyController.abort();
    await assert.rejects(bodyRead, (error: Error) => error.name === 'AbortError');

    globalThis.fetch = async () => { throw new Error('connection refused'); };
    await api.runSafe(() => http.get('/api/pairs/status'));
    const actualError = recordedError();
    assert.ok(actualError);
    assert.equal(actualError.code, 'NETWORK_ERROR', 'actual network failures must remain visible');
    assert.equal(cells[0].value, false);
    console.log('client request race selfcheck passed: StrictMode cancel/replacement, latest loading/error, stale failure, response cancellation and real network error (React hook adapter; no DOM)');
  } finally {
    globalThis.fetch = originalFetch;
    for (const { key, descriptor } of originals.reverse()) {
      if (descriptor) Object.defineProperty(React, key, descriptor); else Reflect.deleteProperty(React, key);
    }
    useUiStore.setState(initialUi);
  }
};
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
