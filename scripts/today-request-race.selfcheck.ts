import assert from 'node:assert/strict';
import React from 'react';
import { usersApi } from '@/client/api/users.api';
import { entryApi } from '@/client/api/entry.api';
import { pairInvitesApi } from '@/client/api/pairInvites.api';
import { pairsApi, type PairSummaryDTO } from '@/client/api/pairs.api';
import { weeklyCyclesApi, type CurrentWeeklyCycleDTO } from '@/client/api/weeklyCycles.api';
import { recommendationsApi } from '@/client/api/recommendations.api';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';
import { normalizePairMe, normalizePairSummary } from '@/client/viewmodels/pair.viewmodels';
import { ApiClientError } from '@/client/api/errors';
import type { CurrentUserDTO, PairStatusDTO } from '@/client/api/types';

type Cell = object | string | number | boolean | null | undefined;
type Dependencies = readonly Cell[];
const cells: Array<{ value: Cell }> = [];
const refs: Array<{ current: Cell }> = [];
const callbacks: Array<{ dependencies: Dependencies; value: object }> = [];
const effects: Array<{ dependencies?: Dependencies; cleanup?: () => void }> = [];
let stateIndex = 0; let refIndex = 0; let callbackIndex = 0; let effectIndex = 0;
let queued: Array<() => void> = [];
const same = (left?: Dependencies, right?: Dependencies) => Boolean(left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index])));
const originalDescriptors: Array<{ target: object; key: string; descriptor?: PropertyDescriptor }> = [];
function replace(target: object, key: string, value: object) {
  originalDescriptors.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}
const tick = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
}
const user: CurrentUserDTO = { id: 'self', username: 'Участник', avatar: '', entryCohort: 'EXISTING_PARTNER', entryCompletedAt: '2026-09-09', personal: { age: 25, gender: 'female', city: 'Тестовый город', relationshipStatus: 'in_relationship' } };
const pair = (id: string | null, status: 'active' | 'paused' | 'ended' = 'active') => normalizePairMe({ pair: id ? { id, status } : null });
const status = (id: string | null): PairStatusDTO => id ? { hasActive: true, pairId: id, pairKey: id, peer: { id: 'peer', username: 'Партнёр', avatar: '' } } : { hasActive: false };
const summary = (id: string): PairSummaryDTO => {
  const value = normalizePairSummary({ pair: { id, status: 'active' }, nextStep: { kind: 'complete_weekly_checkin', title: id, href: '#weekly-checkin', ctaLabel: 'Ответить' } });
  assert.ok(value); return value;
};
const cycle = (id: string): CurrentWeeklyCycleDTO => ({
  pairId: id, cycleId: 'cycle', cycleKey: 'week', window: { startsAt: '', endsAt: '', status: 'OPEN', timeZone: 'UTC' },
  currentUser: { completionStatus: 'PENDING' }, peer: { completionStatus: 'PENDING' },
  pair: { bothSubmitted: false, dataStatus: 'NOT_READY', reasonCodes: [], signals: [] },
  snapshot: { revision: 1, generatedAt: '', inputDefinitionVersion: '', algorithmVersion: '', displayVersion: '' },
});

async function main() {
  const originals = { users: { ...usersApi }, pairs: { ...pairsApi }, cycles: { ...weeklyCyclesApi }, recommendations: { ...recommendationsApi }, entry: { ...entryApi }, invites: { ...pairInvitesApi } };
  replace(globalThis, 'document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });
  replace(globalThis, 'window', { addEventListener() {}, removeEventListener() {} });
  // Preserve actual orchestration, stores and API-error mapping, adapting only hooks.
  replace(React, 'useState', <T extends Cell>(initial: T): [T, (value: T | ((prior: T) => T)) => void] => {
    const index = stateIndex++; const cell = cells[index] ?? (cells[index] = { value: initial });
    return [cell.value as T, (value) => { cell.value = typeof value === 'function' ? value(cell.value as T) : value; }];
  });
  replace(React, 'useRef', <T extends Cell>(initial: T) => {
    const index = refIndex++; return (refs[index] ?? (refs[index] = { current: initial })) as { current: T };
  });
  replace(React, 'useMemo', <T extends Cell>(factory: () => T) => factory());
  replace(React, 'useDebugValue', () => {});
  replace(React, 'useSyncExternalStore', <T extends Cell>(_subscribe: object, snapshot: () => T) => snapshot());
  replace(React, 'useCallback', <T extends object>(callback: T, dependencies: Dependencies): T => {
    const index = callbackIndex++; const prior = callbacks[index];
    if (prior && same(prior.dependencies, dependencies)) return prior.value as T;
    callbacks[index] = { dependencies, value: callback }; return callback;
  });
  replace(React, 'useEffect', (effect: () => void | (() => void), dependencies?: Dependencies) => {
    const index = effectIndex++; const prior = effects[index];
    if (prior && same(prior.dependencies, dependencies)) return;
    queued.push(() => { prior?.cleanup?.(); const cleanup = effect(); effects[index] = { dependencies, ...(cleanup ? { cleanup } : {}) }; });
  });
  const calls: string[] = [];
  const install = (id: string | null) => {
    entryApi.get = async () => ({ user: { ...user, publicId: 'test' }, hasPair: Boolean(id), onboardingCompleted: true, cityCatalogVersion: 'test', searchCities: [] });
    pairInvitesApi.getCurrent = async () => null;
    usersApi.getCurrentUser = async () => user;
    pairsApi.getMyPair = async () => pair(id);
    pairsApi.getStatus = async () => status(id);
    pairsApi.getSummary = async (scope) => { calls.push(scope); return summary(scope); };
    weeklyCyclesApi.getCurrent = async (scope) => cycle(scope);
    recommendationsApi.getOverview = async () => ({ current: null, history: [] });
  };
  const cache = (id: string | null, pairStatus: 'active' | 'paused' | 'ended' = 'active') => {
    const store = useEntitiesStore.getState();
    store.setCurrentUser('users:me', user);
    store.setPairMe('pairs:me:self', pair(id, pairStatus));
    store.setPairStatus('pairs:status:self', status(id));
  };
  const cleanup = () => { effects.forEach((effect) => effect.cleanup?.()); effects.length = 0; };
  const reset = (id: string | null) => { cleanup(); cells.length = 0; refs.length = 0; callbacks.length = 0; calls.length = 0; install(id); cache(id); };
  try {
    const { useTodayDashboard } = await import('@/client/hooks/useTodayDashboard');
    const renderHook = <T>(probe: () => T) => {
      stateIndex = 0; refIndex = 0; callbackIndex = 0; effectIndex = 0; queued = [];
      const result = probe(); queued.forEach((effect) => effect()); return result;
    };
    const render = () => renderHook(useTodayDashboard);

    reset(null);
    useEntitiesStore.getState().setCurrentUser('users:me', { ...user, entryCohort: 'SOLO' });
    const freshUser = deferred<CurrentUserDTO>(); usersApi.getCurrentUser = () => freshUser.promise;
    assert.equal(render().action, null, 'cached intent cannot flash before the first context request');
    await tick(); assert.equal(render().action, null, 'cached intent stays hidden while user refresh is pending');
    freshUser.resolve(user); await tick();
    render(); await tick();
    assert.equal(render().action?.href, '/invite');

    reset('a'); render(); await tick();
    let flow = render();
    assert.equal(flow.action?.href, '/pair/a#weekly-checkin');
    assert.deepEqual(calls, ['a'], 'initial scope requests the cycle aggregate once');
    const sameScopeRefresh = flow.refresh();
    const duplicateRefresh = flow.refresh();
    render(); await sameScopeRefresh; await duplicateRefresh; await tick(); flow = render();
    assert.deepEqual(calls, ['a', 'a'], 'same-scope and coalesced refresh do not duplicate aggregates');

    const heldUser = deferred<CurrentUserDTO>(); usersApi.getCurrentUser = () => heldUser.promise;
    const staleRefresh = flow.refresh(); await tick(); render();
    cache('b'); render(); await tick(); render();
    heldUser.resolve(user); await staleRefresh; await tick(); flow = render();
    assert.deepEqual(calls, ['a', 'a', 'b'], 'old refresh cannot abort/reload the previous Pair after a scope switch');
    assert.equal(flow.action?.href, '/pair/b#weekly-checkin');

    reset('a');
    const lateSummary = deferred<PairSummaryDTO>();
    pairsApi.getSummary = async (id) => { calls.push(id); return id === 'a' ? lateSummary.promise : summary(id); };
    render(); await tick(); render();
    cache('b'); render(); await tick(); render();
    lateSummary.resolve(summary('a')); await tick(); flow = render();
    assert.equal(flow.action?.href, '/pair/b#weekly-checkin', 'late old Pair response cannot revive a stale action');

    reset('a');
    pairsApi.getSummary = async () => { throw new ApiClientError({ status: 403, code: 'ACCESS_DENIED', message: 'Доступ потерян' }); };
    render(); await tick(); flow = render();
    assert.equal(flow.action, null); assert.equal(flow.pairId, null); assert.equal(flow.summary, null);
    assert.ok(flow.error, 'access denial must have an explicit error and no private continuation');
    install('a'); await flow.refresh(); await tick(); flow = render();
    assert.equal(flow.action?.href, '/pair/a#weekly-checkin', 'explicit retry recovers a current successful context');
    cache('a', 'paused'); flow = render();
    assert.equal(flow.action?.label, 'Открыть состояние пары', 'lifecycle removes an active action in the same render');
    await tick();

    reset('a'); render(); await tick(); flow = render();
    const afterUnmount = deferred<CurrentUserDTO>(); usersApi.getCurrentUser = () => afterUnmount.promise;
    const abandonedRefresh = flow.refresh(); await tick(); cleanup();
    afterUnmount.resolve(user); await abandonedRefresh; await tick();
    assert.deepEqual(calls, ['a'], 'a refresh completing after unmount starts no cycle requests');
    console.log('Today request race self-check passed: cached intent, request coalescing, Pair switch, late result, denial/retry, lifecycle and unmount.');
  } finally {
    cleanup();
    Object.assign(usersApi, originals.users); Object.assign(pairsApi, originals.pairs); Object.assign(weeklyCyclesApi, originals.cycles); Object.assign(recommendationsApi, originals.recommendations);
    Object.assign(entryApi, originals.entry); Object.assign(pairInvitesApi, originals.invites);
    for (const { target, key, descriptor } of originalDescriptors.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor); else Reflect.deleteProperty(target, key);
    }
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
