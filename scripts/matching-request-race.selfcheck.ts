import assert from 'node:assert/strict';
import React from 'react';
import { matchApi, type MatchLikeDTO, type MatchingConnectionDTO, type MatchFeedCandidateDTO, type MatchingFeedDTO, type MatchingCardDTO, type SaveMatchingCardRequest } from '@/client/api/match.api';
import { ApiClientError, type UiErrorState } from '@/client/api/errors';
import { usersApi } from '@/client/api/users.api';
import { pairsApi } from '@/client/api/pairs.api';
import type { CurrentUserDTO, PairMeDTO } from '@/client/api/types';
import { useEntitiesStore } from '@/client/stores/useEntitiesStore';

// Actual matching hooks/useApi execute against deferred API calls. Only React's
// scheduling and store subscription boundary are adapted; no network/DB fixtures.
type Cell = object | string | number | boolean | null | undefined;
type Dependencies = readonly Cell[];
const cells: Array<{ value: Cell }> = [];
const refs: Array<{ current: Cell }> = [];
const callbacks: Array<{ dependencies: Dependencies; value: object }> = [];
const effects: Array<{ dependencies?: Dependencies; cleanup?: () => void }> = [];
let stateIndex = 0; let refIndex = 0; let callbackIndex = 0; let effectIndex = 0;
let queued: Array<() => void> = [];
const same = (left?: Dependencies, right?: Dependencies) => Boolean(left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index])));
const originalDescriptors: Array<{ key: string; descriptor?: PropertyDescriptor }> = [];
function replace(key: string, value: object) {
  originalDescriptors.push({ key, descriptor: Object.getOwnPropertyDescriptor(React, key) });
  Object.defineProperty(React, key, { value, configurable: true, writable: true });
}
const tick = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
}
const like = (id: string): MatchLikeDTO => ({ id, status: 'SENT', role: 'RECIPIENT', peer: { id: 'peer', username: 'Участник', avatar: '' }, allowedActions: ['ACCEPT'] });
const connection = (id: string): MatchingConnectionDTO => ({ id, participant: { id: 'peer', username: 'Участник', avatar: '' }, stage: 'TALKING', status: 'ACTIVE', confirmation: { state: 'NONE', requestedByMe: false, confirmedByMe: false, confirmedByPartner: false }, allowedActions: ['REQUEST'] });
const candidate = (id: string): MatchFeedCandidateDTO => ({ candidate: { id, username: 'Синтетический участник', avatar: '' }, card: { requirements: ['Диалог', 'Уважение', 'Поддержка'], questions: ['Вопрос А', 'Вопрос Б'] }, fit: { label: 'LOW_INFORMATION', confidence: 'LOW', explanations: [] }, candidateGrant: `synthetic-grant-${id}` });
type Probe = { id: string | null; loading: boolean; pending: boolean; error: UiErrorState | null; mutate: () => Promise<boolean>; refresh: () => Promise<boolean> };

async function main() {
  const originalApi = { ...matchApi };
  const originalUsers = { ...usersApi };
  const originalPairs = { ...pairsApi };
  replace('useState', <T extends Cell>(initial: T): [T, (value: T | ((prior: T) => T)) => void] => {
    const index = stateIndex++; const cell = cells[index] ?? (cells[index] = { value: initial });
    return [cell.value as T, (value) => { cell.value = typeof value === 'function' ? value(cell.value as T) : value; }];
  });
  replace('useRef', <T extends Cell>(initial: T) => {
    const index = refIndex++; return (refs[index] ?? (refs[index] = { current: initial })) as { current: T };
  });
  replace('useDebugValue', () => {});
  replace('useMemo', <T extends Cell>(factory: () => T): T => factory());
  replace('useSyncExternalStore', <T extends Cell>(_subscribe: object, snapshot: () => T) => snapshot());
  replace('useCallback', <T extends object>(callback: T, dependencies: Dependencies): T => {
    const index = callbackIndex++; const prior = callbacks[index];
    if (prior && same(prior.dependencies, dependencies)) return prior.value as T;
    callbacks[index] = { dependencies, value: callback }; return callback;
  });
  replace('useEffect', (effect: () => void | (() => void), dependencies?: Dependencies) => {
    const index = effectIndex++; const prior = effects[index];
    if (prior && same(prior.dependencies, dependencies)) return;
    queued.push(() => { prior?.cleanup?.(); const cleanup = effect(); effects[index] = { dependencies, ...(cleanup ? { cleanup } : {}) }; });
  });
  const cleanup = () => { effects.forEach((effect) => effect.cleanup?.()); effects.length = 0; };
  const reset = () => { cleanup(); cells.length = 0; refs.length = 0; callbacks.length = 0; };
  const renderHook = <T>(probe: () => T) => {
    stateIndex = 0; refIndex = 0; callbackIndex = 0; effectIndex = 0; queued = [];
    const result = probe(); queued.forEach((effect) => effect()); return result;
  };
  try {
    const { useMatchLike } = await import('@/client/hooks/useMatchLike');
    const { useMatchingConnection } = await import('@/client/hooks/useMatchingConnection');
    const { useMatchFeed } = await import('@/client/hooks/useMatchFeed');
    const useLikeProbe = (id: string): Probe => {
      const flow = useMatchLike(id);
      return { id: flow.like?.id ?? null, loading: flow.loading, pending: flow.actionLoading, error: flow.error, mutate: flow.accept, refresh: flow.refetch };
    };
    const useConnectionProbe = (id: string): Probe => {
      const flow = useMatchingConnection(id);
      return { id: flow.connection?.id ?? null, loading: flow.loading, pending: flow.actionLoading, error: flow.error, mutate: () => flow.confirm('REQUEST'), refresh: flow.refetch };
    };
    for (const [name, probe] of [['like', useLikeProbe], ['connection', useConnectionProbe]] as const) {
      for (const outcome of ['success', 'access-error'] as const) {
        reset();
        const first = deferred<void>();
        const second = deferred<void>();
        const calls: string[] = [];
        matchApi.getLike = async (id) => like(id);
        matchApi.getConnection = async (id) => connection(id);
        const mutation = async (id: string) => { calls.push(id); await (id === 'a' ? first.promise : second.promise); };
        matchApi.accept = async (id) => { await mutation(id); return like(id); };
        matchApi.confirmConnection = async (id) => { await mutation(id); return connection(id); };
        const render = (id: string) => renderHook(() => probe(id));
        render('a'); await tick();
        const initial = render('a');
        assert.equal(initial.id, 'a');
        const oldMutation = initial.mutate(); await tick();
        const changed = render('b');
        assert.equal(changed.id, null, `${name}: new scope must not expose previous private DTO in its first render`);
        await tick(); let current = render('b');
        assert.equal(current.id, 'b', `${name}: a pending old mutation must not block loading the new scope`);
        assert.equal(current.pending, false, `${name}: pending state belongs to its own scope`);
        if (outcome === 'access-error') {
          first.reject(new ApiClientError({ status: 403, code: 'ACCESS_DENIED', message: 'Old scope unavailable' }));
          await oldMutation; await tick(); current = render('b');
          assert.equal(current.id, 'b', `${name}: old access error cannot clear the new DTO`);
          assert.equal(current.error, null, `${name}: old access error cannot replace the new scope status`);
        } else {
          const newMutation = current.mutate(); await tick();
          first.resolve(); await oldMutation; await tick(); current = render('b');
          assert.equal(current.id, 'b', `${name}: old mutation cannot revive the previous DTO`);
          const repeatedMutation = current.mutate();
          await tick();
          assert.deepEqual(calls, ['a', 'b'], `${name}: old completion must not unlock a pending new mutation`);
          second.resolve(); await newMutation; await repeatedMutation; await tick();
          assert.equal(render('b').pending, false);
        }
      }

      reset();
      const lateRead = deferred<void>();
      matchApi.getLike = async (id) => { if (id === 'a') await lateRead.promise; return like(id); };
      matchApi.getConnection = async (id) => { if (id === 'a') await lateRead.promise; return connection(id); };
      const render = (id: string) => renderHook(() => probe(id));
      render('a'); await tick(); render('b'); await tick();
      assert.equal(render('b').id, 'b');
      lateRead.reject(new ApiClientError({ status: 403, code: 'ACCESS_DENIED', message: 'Old scope unavailable' }));
      await tick();
      assert.equal(render('b').id, 'b', `${name}: aborted late read error cannot erase the new scope`);
      assert.equal(render('b').error, null);
    }
    for (const outcome of ['success', 'network-error'] as const) {
      reset();
      const blockAck = deferred<void>();
      const guardedRead = deferred<MatchLikeDTO>();
      let reads = 0;
      matchApi.getLike = async (id) => ++reads === 1 ? { ...like(id), card: candidate('a').card } : guardedRead.promise;
      matchApi.block = async () => { await blockAck.promise; return { blocked: true }; };
      const render = () => renderHook(() => useMatchLike('block-target'));
      render(); await tick();
      const operation = render().block(); await tick();
      blockAck.resolve(); await tick();
      assert.equal(Boolean(render().like), false, 'acknowledged block must immediately remove private Like before its replacement GET settles');
      if (outcome === 'network-error') guardedRead.reject(new ApiClientError({ status: 0, code: 'NETWORK_ERROR', message: 'Synthetic replacement read failed' }));
      else guardedRead.resolve({ ...like('block-target'), status: 'BLOCKED', allowedActions: [] });
      await operation; await tick();
      const current = render();
      assert.equal(Boolean(current.like?.card), false, 'failed replacement GET cannot retain the pre-block card');
      assert.equal(current.like?.allowedActions.length ?? 0, 0, 'failed replacement GET cannot retain pre-block actions');
      if (outcome === 'network-error') assert.equal(current.loading, false, 'failed guarded replacement must show a recoverable error rather than an endless loading state');
    }

    for (const operation of ['detail', 'create'] as const) {
      for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'ACCESS_DENIED'], [404, 'ACCESS_DENIED'], [409, 'MATCHING_BLOCKED'], [409, 'MATCHING_SOLO_REQUIRED']] as const) {
        reset();
        const fixture: MatchingFeedDTO = { items: [candidate('a'), candidate('b')], nextCursor: 'synthetic-next', feedRevision: 'synthetic-revision' };
        const staleRead = deferred<MatchingFeedDTO>();
        let reads = 0;
        // Deliberately ignore abort here: generation fencing must also reject a
        // response that has already reached the transport before cancellation.
        matchApi.getFeed = async () => ++reads === 1 ? fixture : staleRead.promise;
        matchApi.getCandidateCard = async () => candidate('a');
        const render = () => renderHook(() => useMatchFeed());
        render(); await tick();
        if (operation === 'create') { await render().openCandidate(fixture.items[0]); await tick(); }
        const lateRefresh = render().refetch(); await tick();
        const error = new ApiClientError({ status, code, message: 'Synthetic candidate access revoked' });
        if (operation === 'detail') {
          matchApi.getCandidateCard = async () => { throw error; };
          await render().openCandidate(fixture.items[0]);
        } else {
          matchApi.createLike = async () => { throw error; };
          await render().createLike({ agreements: [true, true, true], answers: ['Синтетический А', 'Синтетический Б'] });
        }
        await tick();
        const expectedIds = status === 401 || code === 'MATCHING_SOLO_REQUIRED' ? [] : ['b'];
        const denied = render();
        assert.equal(denied.selected, null, `${operation}/${status}: denied modal must close`);
        assert.equal(denied.candidateCard, null, `${operation}/${status}: denied detail must clear`);
        assert.deepEqual(denied.items.map((item) => item.candidate.id), expectedIds, `${operation}/${status}: revoked candidate must disappear from the underlying feed`);
        if (status === 401) assert.equal(denied.nextCursor, undefined, 'auth loss must remove the private feed cursor');
        staleRead.resolve(fixture); await lateRefresh; await tick();
        assert.deepEqual(render().items.map((item) => item.candidate.id), expectedIds, `${operation}/${status}: stale feed response cannot restore revoked cards`);
      }
    }
    for (const outcome of ['success', 'network-error', 'access-error'] as const) {
      reset();
      const lateDetail = deferred<MatchFeedCandidateDTO>();
      let detailSignal: AbortSignal | undefined;
      matchApi.getFeed = async () => ({ items: [candidate('a')], feedRevision: 'synthetic-revision' });
      matchApi.getCandidateCard = async (_id, _grant, signal) => { detailSignal = signal; return lateDetail.promise; };
      const render = () => renderHook(() => useMatchFeed());
      render(); await tick();
      const reading = render().openCandidate(candidate('a')); await tick();
      assert.equal(render().mutationLoading, false, 'reading a card must not lock modal closing as a mutation');
      render().closeCandidate(); await tick();
      assert.equal(detailSignal?.aborted, true, 'closing an initial read must cancel its transport');
      assert.equal(render().selected, null, 'initial card read remains dismissible');
      if (outcome === 'success') lateDetail.resolve(candidate('a'));
      else lateDetail.reject(new ApiClientError({ status: outcome === 'access-error' ? 403 : 0, code: outcome === 'access-error' ? 'ACCESS_DENIED' : 'NETWORK_ERROR', message: 'Synthetic cancelled detail failure' }));
      await reading; await tick();
      assert.equal(render().selected, null, 'a closed detail result must not reopen its modal');
      assert.equal(render().candidateCard, null, 'a closed detail result must not restore its data');
      assert.equal(render().actionError, null, 'a closed detail failure must not leave an error on the feed');
      assert.equal(render().items.length, 1, 'a cancelled detail failure must not invalidate the current feed');
    }

    reset();
    const mutationAck = deferred<MatchLikeDTO>();
    matchApi.getFeed = async () => ({ items: [candidate('a'), candidate('b')], feedRevision: 'synthetic-revision' });
    matchApi.getCandidateCard = async () => candidate('a');
    matchApi.createLike = async () => mutationAck.promise;
    const renderFeed = () => renderHook(() => useMatchFeed());
    renderFeed(); await tick(); await renderFeed().openCandidate(candidate('a')); await tick();
    const submitting = renderFeed().createLike({ agreements: [true, true, true], answers: ['Синтетический А', 'Синтетический Б'] }); await tick();
    assert.equal(renderFeed().mutationLoading, true, 'submission has its own pending state');
    renderFeed().closeCandidate(); await tick();
    assert.equal(renderFeed().selected?.candidate.id, 'a', 'in-flight mutation cannot be dismissed as a read');
    assert.equal(await renderFeed().openCandidate(candidate('b')), false, 'candidate cannot switch before mutation acknowledgement');
    matchApi.getFeed = async () => { throw new ApiClientError({ status: 401, code: 'AUTH_REQUIRED', message: 'Synthetic session loss' }); };
    await renderFeed().refetch(); await tick();
    assert.equal(renderFeed().candidateCard, null, 'confirmed access loss removes the card even during a mutation');
    assert.equal(renderFeed().mutationLoading, true, 'removing private card data must not prematurely release pending mutation state');
    assert.equal(await renderFeed().openCandidate(candidate('b')), false, 'data removal cannot unlock a pending mutation');
    mutationAck.resolve(like('late-created-like')); await submitting; await tick();
    assert.equal(renderFeed().mutationLoading, false);
    assert.equal(renderFeed().selected, null, 'late acknowledgement cannot restore a resource after access loss');
    assert.equal(renderFeed().lastLike, null, 'late acknowledgement cannot restore its private Like after access loss');
    reset();
    const { useMatchProfile } = await import('@/client/hooks/useMatchProfile');
    const oldCard: MatchingCardDTO = { card: null, revision: 1, requiredDataReady: false, missingRequiredTopics: [] };
    const input: SaveMatchingCardRequest = { requirements: ['Диалог', 'Забота', 'Уважение'], give: ['Поддержка', 'Внимание', 'Время'], questions: ['Один?', 'Два?', 'Три?'], ageRange: { min: 18, max: 40 }, maxDistanceKm: 50, active: false, actual: { relationshipIntent: 'LOOKING_FOR_LONG_TERM', childrenIntent: 'UNSURE' } };
    matchApi.getOwnCard = async () => oldCard;
    matchApi.getPreferences = async () => ({ revision: 1, registryVersion: 1, preferences: [] });
    const renderProfile = () => renderHook(() => useMatchProfile());
    renderProfile(); await tick();
    const staleCard = deferred<MatchingCardDTO>();
    matchApi.getOwnCard = () => staleCard.promise;
    const staleCardRefresh = renderProfile().refetch(); await tick();
    matchApi.saveOwnCard = async () => ({ ...oldCard, revision: 2 });
    assert.equal(await renderProfile().saveCard(input), true);
    staleCard.resolve(oldCard); await staleCardRefresh; await tick();
    assert.equal(renderProfile().card?.revision, 2, 'late profile refresh cannot overwrite an acknowledged card save');
    const revokedCard = deferred<MatchingCardDTO>();
    matchApi.getOwnCard = () => revokedCard.promise;
    const revokedCardRefresh = renderProfile().refetch(); await tick();
    matchApi.saveOwnCard = async () => { throw new ApiClientError({ status: 409, code: 'MATCHING_SOLO_REQUIRED', message: 'Режим изменился' }); };
    assert.equal(await renderProfile().saveCard(input), false);
    revokedCard.resolve(oldCard); await revokedCardRefresh; await tick();
    assert.equal(renderProfile().card, null, 'eligibility denial removes card and a late read cannot revive it');
    assert.equal(renderProfile().preferences, null);
    assert.equal(renderProfile().loading, false, 'eligibility denial must not show an endless profile loader');

    reset();
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { visibilityState: 'visible' }) });
    try {
      const { useMatchingAccess } = await import('@/client/hooks/useMatchingAccess');
      const solo: CurrentUserDTO = { id: 'actor', username: 'Синтетический участник', avatar: '', entryCohort: 'SOLO', entryCompletedAt: '2026-09-09T00:00:00Z', personal: { age: 25, city: 'Москва', gender: 'male', relationshipStatus: 'seeking' } };
      usersApi.getCurrentUser = async () => solo;
      pairsApi.getStatus = async () => ({ hasActive: false });
      pairsApi.getMyPair = async () => ({ pair: null, hasActive: false, hasAny: false, status: null });
      const renderAccess = () => renderHook(() => useMatchingAccess());
      assert.equal(renderAccess().allowed, false, 'cached user data alone cannot authorize the first matching render');
      await tick();
      assert.equal(renderAccess().allowed, true);
      const oldUser = deferred<CurrentUserDTO>();
      usersApi.getCurrentUser = () => oldUser.promise;
      const oldRefresh = renderAccess().refresh();
      await tick();
      usersApi.getCurrentUser = async () => ({ ...solo, personal: { ...solo.personal!, relationshipStatus: 'in_relationship' } });
      await renderAccess().refresh(); await tick();
      assert.equal(renderAccess().allowed, false, 'declared relationships must remove matching without linked Pair');
      oldUser.resolve(solo); await oldRefresh; await tick();
      assert.equal(renderAccess().eligibility, 'EXISTING_PARTNER', 'late old user response cannot restore matching');
      usersApi.getCurrentUser = async () => solo;
      for (const status of ['active', 'paused'] as const) {
        pairsApi.getMyPair = async () => ({ pair: { id: 'pair', key: 'pair-key', members: ['actor', 'peer'], status }, hasActive: true, hasAny: true, status });
        await renderAccess().refresh(); await tick();
        assert.equal(renderAccess().eligibility, 'PAIR_ACTIVE');
        assert.equal(renderAccess().allowed, false, `${status} Pair cannot authorize matching even while the other pair endpoint is stale`);
      }
      pairsApi.getMyPair = async () => ({ pair: null, hasActive: false, hasAny: false, status: null });
      usersApi.getCurrentUser = async () => ({ ...solo, entryCohort: undefined, entryCompletedAt: undefined });
      await renderAccess().refresh(); await tick();
      assert.equal(renderAccess().eligibility, 'ENTRY_REQUIRED');
      assert.equal(renderAccess().allowed, false);
      useEntitiesStore.getState().setCurrentUser('users:me', { ...solo, id: 'different-session' });
      assert.equal(renderAccess().allowed, false, 'a different session requires a fresh complete access check');
      const unmountedUser = deferred<CurrentUserDTO>();
      const unmountedPair = deferred<PairMeDTO>();
      usersApi.getCurrentUser = () => unmountedUser.promise;
      pairsApi.getMyPair = () => unmountedPair.promise;
      const unmountedRefresh = renderAccess().refresh(); await tick();
      reset();
      const newSessionUser = { ...solo, id: 'new-session' };
      useEntitiesStore.getState().setCurrentUser('users:me', newSessionUser);
      useEntitiesStore.getState().setPairMe('pairs:me:self', { pair: { id: 'new-pair', key: 'new-pair-key', members: ['new-session', 'peer'], status: 'paused' }, hasActive: true, hasAny: true, status: 'paused' });
      unmountedUser.resolve(solo);
      unmountedPair.resolve({ pair: null, hasActive: false, hasAny: false, status: null });
      await unmountedRefresh; await tick();
      assert.equal(useEntitiesStore.getState().getCurrentUser('users:me')?.id, 'new-session', 'unmounted matching checks cannot overwrite another screen session cache');
      assert.equal(useEntitiesStore.getState().getPairMe('pairs:me:self')?.pair?.id, 'new-pair', 'unmounted matching checks cannot remove the current pair cache');
    } finally {
      reset();
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
    }
    console.log('Matching request race self-check passed: scope isolation, stale denial, block clearing, whole-feed eligibility revocation, access refresh races, active/paused Pair exclusion and independent mutation lock.');
  } finally {
    cleanup(); Object.assign(matchApi, originalApi); Object.assign(usersApi, originalUsers); Object.assign(pairsApi, originalPairs);
    for (const { key, descriptor } of originalDescriptors.reverse()) {
      if (descriptor) Object.defineProperty(React, key, descriptor); else Reflect.deleteProperty(React, key);
    }
  }
}
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
