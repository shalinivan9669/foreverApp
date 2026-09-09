import assert from 'node:assert/strict';
import React from 'react';
import { notificationsApi, type NotificationDTO, type NotificationPageDTO } from '@/client/api/notifications.api';
import { ApiClientError } from '@/client/api/errors';

// Exercise the actual hook with deferred API responses, using the small React
// adapter pattern from continuation-ui.selfcheck. Hook cells contain objects only.
const states: Array<{ value: object }> = [];
const refs: Array<{ current: object | boolean | number | null }> = [];
type Dependency = object | boolean | number | string | null | undefined;
type Dependencies = readonly Dependency[];
const effects: Array<{ dependencies?: Dependencies; cleanup?: () => void }> = [];
const callbacks: Array<{ dependencies: Dependencies; value: object }> = [];
let stateIndex = 0;
let refIndex = 0;
let effectIndex = 0;
let callbackIndex = 0;
let scheduled: Array<() => void> = [];
const originals: Array<{ key: string; descriptor?: PropertyDescriptor }> = [];
const sameDependencies = (a: Dependencies | undefined, b: Dependencies | undefined) =>
  Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
const stub = (key: string, value: object) => {
  originals.push({ key, descriptor: Object.getOwnPropertyDescriptor(React, key) });
  Object.defineProperty(React, key, { value, configurable: true, writable: true });
};
const render = <T>(hook: () => T): T => {
  stateIndex = 0; refIndex = 0; effectIndex = 0; callbackIndex = 0; scheduled = [];
  const result = hook();
  scheduled.forEach((effect) => effect());
  return result;
};
const unmount = () => effects.forEach((effect) => effect.cleanup?.());
const reset = () => {
  unmount(); states.length = 0; refs.length = 0; effects.length = 0; callbacks.length = 0;
};
const deferred = <T>() => {
  let resolve!: (result: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
const notification = (id: string, isRead = false): NotificationDTO => ({
  id, isRead, type: 'PAIR_JOINED', title: 'Уведомление', message: 'Событие пары',
  action: { label: 'Открыть', href: '/pair' }, createdAt: '2026-09-09T12:00:00.000Z',
});
const page = (ids: string[], nextCursor?: string, unreadCount = 7): NotificationPageDTO => ({
  items: ids.map((id) => notification(id)), nextCursor, unreadCount,
});

async function main() {
  const originalApi = { ...notificationsApi };
  stub('useState', <T extends object>(initial: T): [T, (value: T) => void] => {
    const index = stateIndex++;
    const cell = states[index] ?? (states[index] = { value: initial });
    return [cell.value as T, (value) => { cell.value = value; }];
  });
  stub('useRef', <T extends object | boolean | number | null>(initial: T) => {
    const index = refIndex++;
    return (refs[index] ?? (refs[index] = { current: initial })) as { current: T };
  });
  stub('useCallback', <T extends object>(callback: T, dependencies: Dependencies): T => {
    const index = callbackIndex++;
    const previous = callbacks[index];
    if (previous && sameDependencies(previous.dependencies, dependencies)) return previous.value as T;
    callbacks[index] = { dependencies, value: callback };
    return callback;
  });
  stub('useEffect', (effect: () => void | (() => void), dependencies?: Dependencies) => {
    const index = effectIndex++;
    const previous = effects[index];
    if (previous && sameDependencies(previous.dependencies, dependencies)) return;
    scheduled.push(() => {
      previous?.cleanup?.();
      const cleanup = effect();
      effects[index] = { dependencies, ...(cleanup ? { cleanup } : {}) };
    });
  });
  try {
    const { useNotifications } = await import('@/client/hooks/useNotifications');
    const probe = () => render(useNotifications);
    notificationsApi.list = async () => page(['newest', 'overlap'], 'second');
    probe(); await tick();
    let flow = probe();
    assert.equal(flow.unreadCount, 7);
    assert.equal(flow.nextCursor, 'second');

    const append = deferred<NotificationPageDTO>();
    const cursors: Array<string | undefined> = [];
    notificationsApi.list = (_signal, cursor) => { cursors.push(cursor); return append.promise; };
    const firstAppend = flow.loadMore();
    await flow.loadMore(); await tick();
    assert.deepEqual(cursors, ['second'], 'repeated clicks share one page request');
    append.resolve(page(['overlap', 'older'], 'third'));
    await firstAppend;
    flow = probe();
    assert.deepEqual(flow.items.map((item) => item.id), ['newest', 'overlap', 'older']);
    assert.equal(flow.unreadCount, 7, 'page unreadCount is a total, never an amount to add');

    notificationsApi.list = async (_signal, cursor) => { assert.equal(cursor, 'third'); throw new Error('offline'); };
    await flow.loadMore(); flow = probe();
    assert.equal(flow.moreFailed, true);
    assert.equal(flow.nextCursor, 'third');
    assert.equal(flow.items.length, 3, 'page errors preserve the existing list and retry cursor');
    notificationsApi.list = async (_signal, cursor) => { assert.equal(cursor, 'third'); return page(['oldest']); };
    await flow.loadMore(); flow = probe();
    assert.equal(flow.nextCursor, undefined, 'the last page removes the load-more action');
    assert.equal(flow.moreFailed, false);
    assert.equal(flow.items.length, 4);

    notificationsApi.list = async () => { throw new Error('offline'); };
    await flow.refresh(); flow = probe();
    assert.equal(flow.loadFailed, true);
    assert.equal(flow.items.length, 4, 'ordinary refresh errors preserve previously loaded pages');
    notificationsApi.list = async () => page(['fresh'], 'fresh-next', 2);
    await flow.refresh(); flow = probe();
    const stalePage = deferred<NotificationPageDTO>();
    notificationsApi.list = (_signal, cursor) => cursor ? stalePage.promise : Promise.resolve(page(['replacement'], 'replacement-next', 3));
    const staleRequest = flow.loadMore(); await tick();
    await flow.refresh();
    stalePage.resolve(page(['stale'], 'stale-next', 99)); await staleRequest;
    flow = probe();
    assert.deepEqual(flow.items.map((item) => item.id), ['replacement']);
    assert.equal(flow.nextCursor, 'replacement-next');
    assert.equal(flow.unreadCount, 3, 'superseded pages cannot overwrite count or cursor');

    const staleReadPage = deferred<NotificationPageDTO>();
    const read = deferred<NotificationDTO>();
    let readCalls = 0;
    let pageCalls = 0;
    notificationsApi.markRead = () => { readCalls += 1; return read.promise; };
    notificationsApi.list = (_signal, cursor) => {
      assert.equal(cursor, 'replacement-next');
      pageCalls += 1;
      return pageCalls === 1 ? staleReadPage.promise : Promise.resolve({ ...page(['replacement', 'read-page'], undefined, 2), items: [notification('replacement', true), notification('read-page')] });
    };
    const overlappingPage = flow.loadMore(); await tick();
    flow.markRead(flow.items[0]); flow.markRead(flow.items[0]);
    assert.equal(readCalls, 1, 'repeated click cannot mark the same notice twice');
    read.resolve(notification('replacement', true)); await tick();
    assert.equal(probe().unreadCount, 2);
    staleReadPage.resolve(page(['replacement', 'read-page'], undefined, 3));
    await overlappingPage; flow = probe();
    assert.equal(pageCalls, 2, 'page overlapping a read is reloaded after the mutation');
    assert.equal(flow.unreadCount, 2);
    assert.equal(flow.items[0].isRead, true, 'a stale page must not undo successful mark-read');

    notificationsApi.markRead = async () => { throw new Error('save failed'); };
    flow.markRead(flow.items[1]); await tick(); flow = probe();
    assert.equal(flow.readFailed, true);
    assert.equal(flow.items[1].isRead, false);
    assert.equal(flow.unreadCount, 2, 'failed nonoptimistic mark-read must not inflate the total');

    const pendingRead = deferred<NotificationDTO>();
    notificationsApi.markRead = () => pendingRead.promise;
    let afterReadFetches = 0;
    notificationsApi.list = async () => { afterReadFetches += 1; return { ...page(['read-page'], undefined, 1), items: [notification('read-page', true)] }; };
    flow.markRead(flow.items[1]);
    const waitingRefresh = flow.refresh(); await tick();
    assert.equal(afterReadFetches, 0, 'refresh waits for an already pending mark-read');
    pendingRead.resolve(notification('read-page', true)); await waitingRefresh;
    flow = probe();
    assert.equal(flow.unreadCount, 1);
    assert.equal(flow.items[0].isRead, true);

    notificationsApi.list = async () => { throw new ApiClientError({ status: 401, code: 'AUTH_REQUIRED', message: 'Войдите снова' }); };
    await flow.refresh(); flow = probe();
    assert.equal(flow.items.length, 0, 'loss of access clears cached private notifications');
    assert.equal(flow.unreadCount, 0);
    assert.equal(flow.nextCursor, undefined);
    assert.equal(flow.loadFailed, true);

    const late = deferred<NotificationPageDTO>();
    notificationsApi.list = () => late.promise;
    const lateRequest = flow.refresh(); await tick();
    unmount();
    const beforeUnmountReply = states[0].value;
    late.resolve(page(['after-unmount'])); await lateRequest;
    assert.equal(states[0].value, beforeUnmountReply, 'unmounted sessions ignore late responses');
    console.log('notifications pagination selfcheck passed: cursor traversal, dedupe, retry, stale responses, unread totals, mark-read races and access loss.');
  } finally {
    reset();
    Object.assign(notificationsApi, originalApi);
    for (const { key, descriptor } of originals.reverse()) {
      if (descriptor) Object.defineProperty(React, key, descriptor);
    }
  }
}

void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
