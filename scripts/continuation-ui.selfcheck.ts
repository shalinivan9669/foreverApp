import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { developmentApi } from "@/client/api/development.api";
import { sharedLifeApi } from "@/client/api/sharedLife.api";
import { ApiClientError } from "@/client/api/errors";
import { developmentRunHref, developmentRunStatus, nextDevelopmentProgramStep, resumableDevelopmentRuns } from "@/client/viewmodels/development.viewmodels";
import { matchingConfirmationCopy } from "@/client/viewmodels/matching";
import type { DevelopmentDetailDTO, DevelopmentOverviewDTO, DevelopmentRunDTO, DevelopmentRunPageDTO } from "@/lib/dto/development.dto";
import type { SharedLifeDTO } from "@/lib/dto/sharedLife.dto";
import { DEFAULT_SHARED_LIFE_SETTINGS } from "@/lib/contracts/sharedLife";

const run = (id: string, overrides: Partial<DevelopmentRunDTO> = {}): DevelopmentRunDTO => ({ id, contentKey: "practice", periodKey: "2026-W01", pairId: null, status: "ACTIVE", myCompletion: false, partnerCompleted: false, completedAt: null, ...overrides });
const detail = (id: string): DevelopmentDetailDTO => ({ run: run(id), ownResult: null, responseOptions: ["Да", "Нет"], content: { key: "practice", revision: 1, kind: "SOLO_PRACTICE", domain: "communication", title: "Занятие", purpose: "Попробовать", durationMinutes: 5, steps: ["Наблюдение"], prompts: ["Что заметили?"], conditions: "Добровольно", outcome: "Опыт", reviewStatus: "DEMO_SELF_REFLECTION" } });
const overview: DevelopmentOverviewDTO = {
  suggestion: { contentKey: "practice", title: "Занятие", reason: "Исследование", basedOn: "EXPLORATION" }, domains: [],
  programs: [{ key: "program", title: "Программа", contentKeys: ["done", "practice"], completedSteps: 1 }],
  content: [{ ...detail("a").content, locked: false, completedCount: 0 }, { ...detail("a").content, key: "done", locked: false, completedCount: 1 }],
  recent: [run("waiting", { pairId: "pair-a", myCompletion: true, status: "PARTIAL" }), run("old-unfinished"), run("closed-pair", { pairId: "pair-old" }), run("done", { status: "COMPLETED", myCompletion: true })],
};
assert.deepEqual(resumableDevelopmentRuns(overview, "pair-a", "active").map((item) => item.id), ["old-unfinished", "waiting"]);
assert.deepEqual(resumableDevelopmentRuns(overview, "pair-a", "ended").map((item) => item.id), ["old-unfinished"]);
assert.equal(developmentRunHref("old/run"), "/development?run=old%2Frun");
assert.equal(nextDevelopmentProgramStep(overview.programs[0], overview)?.key, "practice");
assert.match(developmentRunStatus(run("waiting", { myCompletion: true, status: "PARTIAL" })), /ожидаем партнёра/);
assert.match(developmentRunStatus(run("second", { partnerCompleted: true, pairId: "p" })), /остался ваш результат/);
assert.match(developmentRunStatus(run("final", { status: "COMPLETED", pairId: "p" })), /оба участника/);
assert.match(developmentRunStatus(run("paused", { pairId: "p" }), true), /после возобновления/);
assert.equal(matchingConfirmationCopy({ id: "c", participant: { id: "u", username: "Участник", avatar: "" }, stage: "TALKING", status: "CLOSED", confirmation: { state: "PENDING", requestedByMe: true, confirmedByMe: false, confirmedByPartner: false }, allowedActions: [] }).title, "Знакомство завершено");

// As in client-request-race.selfcheck, exercise real hook request logic with a
// minimal React adapter. Cells are heterogeneous hook state, hence object/boolean/null.
type Cell = object | string | boolean | null;
const cells: Array<{ value: Cell }> = [];
const cellValue = (index: number): Cell => cells[index].value;
const refs: Array<{ current: object | string | number | boolean | null }> = [];
let stateIndex = 0;
let refIndex = 0;
let effectIndex = 0;
let callbackIndex = 0;
type HookDependency = object | string | number | boolean | null | undefined;
type Dependencies = readonly HookDependency[];
const effectCells: Array<{ dependencies?: Dependencies; cleanup?: () => void }> = [];
const callbackCells: Array<{ dependencies: Dependencies; value: object }> = [];
let effects: Array<() => void> = [];
const sameDependencies = (left: Dependencies | undefined, right: Dependencies | undefined) =>
  Boolean(left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index])));
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
const tick = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };
const renderHook = <T>(probe: () => T): T => {
  effects = []; stateIndex = 0; refIndex = 0; effectIndex = 0; callbackIndex = 0;
  const result = probe();
  for (const effect of effects) effect();
  return result;
};
const reset = () => {
  effectCells.forEach((cell) => cell.cleanup?.());
  effectCells.length = 0; callbackCells.length = 0; effects = []; cells.length = 0; refs.length = 0;
};
const main = async () => {
  const originalDevelopment = { ...developmentApi };
  const originalSharedLife = { ...sharedLifeApi };
  stubHook("useState", <T extends Cell>(initial: T): [T, (value: T | ((previous: T) => T)) => void] => {
    const index = stateIndex++; const cell = cells[index] ?? (cells[index] = { value: initial });
    return [cell.value as T, (value) => { cell.value = typeof value === "function" ? value(cell.value as T) : value; }];
  });
  stubHook("useRef", <T extends object | string | number | boolean | null>(initial: T) => {
    const index = refIndex++; return (refs[index] ?? (refs[index] = { current: initial })) as { current: T };
  });
  stubHook("useCallback", <T extends object>(callback: T, dependencies: Dependencies): T => {
    const index = callbackIndex++; const previous = callbackCells[index];
    if (previous && sameDependencies(previous.dependencies, dependencies)) return previous.value as T;
    callbackCells[index] = { value: callback, dependencies }; return callback;
  });
  stubHook("useEffect", (effect: () => void | (() => void), dependencies?: Dependencies) => {
    const index = effectIndex++; const previous = effectCells[index];
    if (previous && sameDependencies(previous.dependencies, dependencies)) return;
    effects.push(() => {
      previous?.cleanup?.(); const cleanup = effect();
      effectCells[index] = { dependencies, ...(cleanup ? { cleanup } : {}) };
    });
  });
  try {
    const { useDevelopment } = await import("@/client/hooks/useDevelopment");
    developmentApi.overview = async () => overview;
    developmentApi.unfinishedRuns = async () => ({ runs: [], nextCursor: null });
    const oldRun = pending<DevelopmentDetailDTO>();
    const newRun = pending<DevelopmentDetailDTO>();
    developmentApi.detail = (id) => id === "old" ? oldRun.promise : newRun.promise;
    const first = renderHook(() => useDevelopment()); await tick();
    const oldRequest = first.open("old");
    renderHook(() => useDevelopment("new")); await tick();
    newRun.resolve(detail("new")); await tick();
    oldRun.reject(new ApiClientError({ status: 403, code: "ACCESS_DENIED", message: "Old access denied" })); await oldRequest;
    assert.equal((cells[1].value as DevelopmentDetailDTO).run.id, "new", "late access failure of a different run must not erase the current run");
    assert.equal(cells[3].value, false);
    assert.equal(cells[5].value, null);

    const navigationOverview = pending<DevelopmentOverviewDTO>();
    developmentApi.overview = () => navigationOverview.promise;
    developmentApi.detail = async (id) => detail(id);
    const oldNavigation = first.open("started-before-back"); await tick();
    renderHook(() => useDevelopment(null)); await tick();
    navigationOverview.resolve(overview);
    assert.equal(await oldNavigation, null, "late overview after leaving a run must not request navigation back to it");

    const lateOverview = pending<DevelopmentOverviewDTO>();
    developmentApi.overview = () => lateOverview.promise;
    const refresh = first.reload();
    developmentApi.detail = async () => { throw new ApiClientError({ status: 409, code: "CONTENT_VERSION_UNAVAILABLE", message: "Version unavailable" }); };
    await first.open("missing");
    lateOverview.resolve(overview); await refresh;
    assert.equal(cells[1].value, null, "missing immutable revision must not leave an actionable old form");
    assert.equal((cellValue(5) as ApiClientError).code, "CONTENT_VERSION_UNAVAILABLE", "overview success must not hide the detail error");

    reset();
    const firstRunPage: DevelopmentRunPageDTO = { runs: [run("first"), run("overlap")], nextCursor: "cursor-1" };
    const nextRunPage: DevelopmentRunPageDTO = { runs: [run("overlap", { myCompletion: true, status: "PARTIAL" }), run("older")], nextCursor: "cursor-2" };
    developmentApi.overview = async () => overview;
    developmentApi.unfinishedRuns = async () => firstRunPage;
    const renderDevelopment = () => renderHook(() => useDevelopment());
    renderDevelopment(); await tick();
    let paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns.map((item) => item.id), ["first", "overlap"]);
    assert.equal(paginated.hasMoreRuns, true);
    const firstAppend = pending<DevelopmentRunPageDTO>();
    const requestedCursors: Array<string | undefined> = [];
    developmentApi.unfinishedRuns = (cursor) => { requestedCursors.push(cursor); return firstAppend.promise; };
    const append = paginated.loadMoreRuns();
    await paginated.loadMoreRuns();
    assert.deepEqual([...requestedCursors], ["cursor-1"], "double activation must coalesce into one next-page request");
    assert.equal(renderDevelopment().runsLoading, true);
    firstAppend.resolve(nextRunPage); await append;
    paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns.map((item) => item.id), ["first", "overlap", "older"]);
    assert.equal(paginated.unfinishedRuns.find((item) => item.id === "overlap")?.myCompletion, true, "a repeated run is replaced by its fresh DTO without another row");
    assert.equal(paginated.runsLoading, false);
    developmentApi.unfinishedRuns = async (cursor) => {
      requestedCursors.push(cursor);
      throw new ApiClientError({ status: 0, code: "NETWORK_ERROR", message: "Network unavailable" });
    };
    await paginated.loadMoreRuns();
    paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns.map((item) => item.id), ["first", "overlap", "older"], "a retryable network failure retains loaded rows");
    assert.equal(paginated.runsError?.code, "NETWORK_ERROR");
    assert.equal(paginated.hasMoreRuns, true);
    developmentApi.unfinishedRuns = async (cursor) => {
      requestedCursors.push(cursor); return { runs: [run("oldest")], nextCursor: null };
    };
    await paginated.loadMoreRuns();
    paginated = renderDevelopment();
    assert.deepEqual([...requestedCursors], ["cursor-1", "cursor-2", "cursor-2"], "network retry must keep the rejected continuation boundary");
    assert.deepEqual(paginated.unfinishedRuns.map((item) => item.id), ["first", "overlap", "older", "oldest"]);
    assert.equal(paginated.runsError, null);
    assert.equal(paginated.hasMoreRuns, false);
    await paginated.loadMoreRuns();
    assert.equal(requestedCursors.length, 3, "the final page cannot issue another load");

    developmentApi.unfinishedRuns = async () => firstRunPage;
    await paginated.reload();
    paginated = renderDevelopment();
    const staleAppend = pending<DevelopmentRunPageDTO>();
    developmentApi.unfinishedRuns = (cursor) => cursor ? staleAppend.promise : Promise.resolve({ runs: [run("fresh-first")], nextCursor: "fresh-cursor" });
    const beforeRefreshAppend = paginated.loadMoreRuns();
    await paginated.reload();
    staleAppend.resolve(nextRunPage); await beforeRefreshAppend;
    paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns.map((item) => item.id), ["fresh-first"], "late append must not join a newly refreshed first page");
    assert.equal(paginated.runsLoading, false);
    const staleFailure = pending<DevelopmentRunPageDTO>();
    developmentApi.unfinishedRuns = (cursor) => cursor ? staleFailure.promise : Promise.resolve(firstRunPage);
    const beforeRefreshFailure = paginated.loadMoreRuns();
    await paginated.reload();
    staleFailure.reject(new ApiClientError({ status: 403, code: "ACCESS_DENIED", message: "Old page denied" })); await beforeRefreshFailure;
    paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns.map((item) => item.id), ["first", "overlap"], "a late failure from an invalidated append cannot erase fresh rows");
    assert.equal(paginated.runsError, null);

    const scopeRequests: Array<string | undefined> = [];
    const freshScopePage = pending<DevelopmentRunPageDTO>();
    developmentApi.unfinishedRuns = (cursor) => {
      scopeRequests.push(cursor);
      return cursor
        ? Promise.reject(new ApiClientError({ status: 409, code: "RUN_LIST_CHANGED", message: "Scope changed" }))
        : freshScopePage.promise;
    };
    const scopeRefresh = paginated.loadMoreRuns(); await tick();
    paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns, [], "scope invalidation clears accumulated rows before fetching current access");
    freshScopePage.resolve({ runs: [run("still-accessible")], nextCursor: null }); await scopeRefresh;
    paginated = renderDevelopment();
    assert.deepEqual(scopeRequests, ["cursor-1", undefined]);
    assert.deepEqual(paginated.unfinishedRuns.map((item) => item.id), ["still-accessible"]);
    assert.ok(paginated.runsNotice);
    assert.equal(paginated.runsLoading, false);
    assert.equal(paginated.runsError, null);

    developmentApi.unfinishedRuns = async () => firstRunPage;
    await paginated.reload();
    paginated = renderDevelopment();
    developmentApi.unfinishedRuns = async (cursor) => {
      throw cursor
        ? new ApiClientError({ status: 409, code: "RUN_LIST_CHANGED", message: "Scope changed again" })
        : new ApiClientError({ status: 0, code: "NETWORK_ERROR", message: "Could not reload current access" });
    };
    await paginated.loadMoreRuns();
    paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns, [], "a failed scope reset cannot restore rows from the previous access scope");
    assert.equal(paginated.runsNotice, null, "a failed refresh must not announce that the current list is displayed");
    assert.equal(paginated.error?.code, "NETWORK_ERROR");
    developmentApi.unfinishedRuns = async () => firstRunPage;
    await paginated.reload();
    paginated = renderDevelopment();
    developmentApi.unfinishedRuns = async () => { throw new ApiClientError({ status: 401, code: "UNAUTHORIZED", message: "Session ended" }); };
    await paginated.loadMoreRuns();
    paginated = renderDevelopment();
    assert.deepEqual(paginated.unfinishedRuns, []);
    assert.equal(paginated.overview, null);
    assert.equal(paginated.hasMoreRuns, false);
    assert.equal(paginated.runsLoading, false);
    assert.equal(paginated.runsError?.status, 401);

    developmentApi.unfinishedRuns = async () => firstRunPage;
    await paginated.reload();
    const revokedRefresh = pending<DevelopmentOverviewDTO>();
    developmentApi.overview = () => revokedRefresh.promise;
    const beforeAccessDenied = paginated.reload();
    developmentApi.detail = async () => { throw new ApiClientError({ status: 403, code: "ACCESS_DENIED", message: "Current access denied" }); };
    await paginated.open("revoked");
    revokedRefresh.resolve(overview); await beforeAccessDenied;
    paginated = renderDevelopment();
    assert.equal(paginated.overview, null, "a read started before current access denial must not resurrect the overview");
    assert.deepEqual(paginated.unfinishedRuns, [], "a read started before current access denial must not resurrect accumulated runs");
    assert.equal(paginated.error?.status, 403);

    reset();
    const latePageAfterDirectDenial = pending<DevelopmentRunPageDTO>();
    developmentApi.overview = async () => overview;
    developmentApi.unfinishedRuns = () => latePageAfterDirectDenial.promise;
    developmentApi.detail = async () => { throw new ApiClientError({ status: 404, code: "NOT_FOUND", message: "Run no longer accessible" }); };
    renderHook(() => useDevelopment("direct-revoked")); await tick();
    latePageAfterDirectDenial.resolve(firstRunPage); await tick();
    const directDenied = renderHook(() => useDevelopment("direct-revoked"));
    assert.equal(directDenied.overview, null, "direct-link access denial invalidates a concurrently loading overview");
    assert.deepEqual(directDenied.unfinishedRuns, []);
    assert.equal(directDenied.busy, false);
    assert.equal(directDenied.loading, false);
    assert.equal(directDenied.error?.status, 404);

    reset();
    const detailAfterOverviewDenial = pending<DevelopmentDetailDTO>();
    developmentApi.overview = async () => { throw new ApiClientError({ status: 401, code: "UNAUTHORIZED", message: "Session expired" }); };
    developmentApi.unfinishedRuns = async () => firstRunPage;
    developmentApi.detail = () => detailAfterOverviewDenial.promise;
    renderHook(() => useDevelopment("late-protected-detail")); await tick();
    detailAfterOverviewDenial.resolve(detail("late-protected-detail")); await tick();
    const sessionDenied = renderHook(() => useDevelopment("late-protected-detail"));
    assert.equal(sessionDenied.detail, null, "a late detail success cannot resurrect protected content after overview auth denial");
    assert.equal(sessionDenied.overview, null);
    assert.deepEqual(sessionDenied.unfinishedRuns, []);
    assert.equal(sessionDenied.busy, false);
    assert.equal(sessionDenied.error?.status, 401);

    reset();
    const { useSharedLife } = await import("@/client/hooks/useSharedLife");
    const workspace: SharedLifeDTO = { pairId: "pair-a", revision: 1, myRole: "A", readOnly: false, today: "2026-09-05", settings: DEFAULT_SHARED_LIFE_SETTINGS, entries: [], budget: [], occasions: [], taskLoad: [], changes: [] };
    sharedLifeApi.get = async () => workspace;
    const shared = renderHook(() => useSharedLife("pair-a")); await tick();
    const stale = pending<SharedLifeDTO>(); sharedLifeApi.get = () => stale.promise;
    const load = shared.reload();
    sharedLifeApi.update = async () => ({ ...workspace, revision: 2 });
    assert.equal(await shared.update({ action: "SETTINGS", expectedRevision: 1, settings: DEFAULT_SHARED_LIFE_SETTINGS }), true);
    stale.resolve(workspace); await load;
    assert.equal((cells[0].value as SharedLifeDTO).revision, 2, "old refresh must not overwrite a newer shared mutation");
    const revoked = pending<SharedLifeDTO>(); sharedLifeApi.get = () => revoked.promise;
    const oldRead = shared.reload();
    sharedLifeApi.update = async () => { throw new ApiClientError({ status: 403, code: "ACCESS_DENIED", message: "Revoked" }); };
    await shared.update({ action: "SETTINGS", expectedRevision: 2, settings: DEFAULT_SHARED_LIFE_SETTINGS });
    revoked.resolve(workspace); await oldRead;
    assert.equal(cells[0].value, null, "a stale read must not resurrect revoked shared data");
    renderHook(() => useSharedLife(null)); await tick();
    assert.equal(cells[1].value, false, "leaving the pair must release loading state");
    assert.equal(cells[0].value, null);

    reset();
    sharedLifeApi.get = async () => workspace;
    const conflictFlow = renderHook(() => useSharedLife("pair-a")); await tick();
    const conflictSnapshot = pending<SharedLifeDTO>();
    let conflictWrites = 0;
    sharedLifeApi.update = async () => { conflictWrites += 1; throw new ApiClientError({ status: 409, code: "REVISION_CONFLICT", message: "Changed" }); };
    sharedLifeApi.get = () => conflictSnapshot.promise;
    const conflictWrite = conflictFlow.update({ action: "SETTINGS", expectedRevision: 1, settings: DEFAULT_SHARED_LIFE_SETTINGS });
    await tick();
    assert.equal(await conflictFlow.update({ action: "SETTINGS", expectedRevision: 1, settings: DEFAULT_SHARED_LIFE_SETTINGS }), false, "conflict reload must keep the mutation lock");
    conflictSnapshot.resolve({ ...workspace, revision: 3 });
    assert.equal(await conflictWrite, false, "loading a newer revision must never silently retry the mutation");
    assert.equal(conflictWrites, 1);
    const conflictReady = renderHook(() => useSharedLife("pair-a"));
    assert.equal(conflictReady.data?.revision, 3, "a conflict loads the guarded server version for draft comparison");
    assert.equal(conflictReady.error?.status, 409, "the unsaved conflict stays visible");
    sharedLifeApi.update = async () => ({ ...workspace, revision: 4 });
    assert.equal(await conflictReady.update({ action: "SETTINGS", expectedRevision: 3, settings: DEFAULT_SHARED_LIFE_SETTINGS }), true);
    assert.equal((cellValue(0) as SharedLifeDTO).revision, 4);

    const staleConflict = pending<SharedLifeDTO>();
    sharedLifeApi.update = async () => { throw new ApiClientError({ status: 409, code: "REVISION_CONFLICT", message: "Changed" }); };
    sharedLifeApi.get = (id) => id === "pair-a" ? staleConflict.promise : Promise.resolve({ ...workspace, pairId: id, revision: 9 });
    const staleConflictWrite = conflictReady.update({ action: "SETTINGS", expectedRevision: 4, settings: DEFAULT_SHARED_LIFE_SETTINGS });
    await tick();
    renderHook(() => useSharedLife("pair-b")); await tick();
    staleConflict.resolve({ ...workspace, revision: 5 });
    assert.equal(await staleConflictWrite, false);
    const changedPair = renderHook(() => useSharedLife("pair-b"));
    assert.equal(changedPair.data?.pairId, "pair-b", "a late conflict snapshot must not resurrect the previous Pair");
    assert.equal(changedPair.data?.revision, 9);
    sharedLifeApi.get = async () => { throw new ApiClientError({ status: 403, code: "ACCESS_DENIED", message: "Revoked" }); };
    await changedPair.update({ action: "SETTINGS", expectedRevision: 9, settings: DEFAULT_SHARED_LIFE_SETTINGS });
    const conflictRevoked = renderHook(() => useSharedLife("pair-b"));
    assert.equal(conflictRevoked.data, null, "access denial while refreshing a conflict removes protected data");
    assert.equal(conflictRevoked.error?.status, 403);

    reset();
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const originalNow = Date.now;
    const windowEvents = new EventTarget();
    class VisibleDocument extends EventTarget { visibilityState = "hidden"; }
    const documentEvents = new VisibleDocument();
    let now = 100_000; Date.now = () => now;
    Object.defineProperty(globalThis, "window", { configurable: true, value: windowEvents });
    Object.defineProperty(globalThis, "document", { configurable: true, value: documentEvents });
    try {
      const { useRefreshOnReturn } = await import("@/client/hooks/useRefreshOnReturn");
      let calls = 0; const response = pending<void>();
      renderHook(() => useRefreshOnReturn(async () => { calls += 1; await response.promise; }));
      windowEvents.dispatchEvent(new Event("focus")); assert.equal(calls, 0, "hidden surface must not refresh");
      documentEvents.visibilityState = "visible";
      documentEvents.dispatchEvent(new Event("visibilitychange"));
      windowEvents.dispatchEvent(new Event("focus")); assert.equal(calls, 1, "focus and visibility events must coalesce");
      now += 20_000; windowEvents.dispatchEvent(new Event("focus")); assert.equal(calls, 1, "in-flight refresh must not overlap");
      response.resolve(); await tick();
      windowEvents.dispatchEvent(new Event("focus")); await tick(); assert.equal(calls, 2);
      now += 5_000; windowEvents.dispatchEvent(new Event("focus")); assert.equal(calls, 2, "return refresh has a 15-second cooldown");
      reset(); now += 20_000; windowEvents.dispatchEvent(new Event("focus")); assert.equal(calls, 2, "unmount must remove listeners");
    } finally {
      Date.now = originalNow;
      if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument); else Reflect.deleteProperty(globalThis, "document");
    }
  } finally {
    reset(); Object.assign(developmentApi, originalDevelopment); Object.assign(sharedLifeApi, originalSharedLife);
    for (const original of originals.reverse()) if (original.descriptor) Object.defineProperty(React, original.key, original.descriptor);
  }
  const read = (path: string) => readFileSync(path, "utf8");
  assert.match(read("src/features/sharedLife/SharedLifePage.tsx"), /expectedRevision: editing\?\.id === entryId \? editing.revision/);
  assert.match(read("src/features/sharedLife/SharedLifePage.tsx"), /!editing && !deleting && !settingsOpen/);
  assert.match(read("src/features/matching/MatchingConnectionPage.tsx"), /Promise\.all\(\[load\(\), connection.refetch\(\)\]\)/);
  assert.match(read("src/app/main-menu/page.tsx"), /<ContinuationPanel/);
  assert.match(read("src/app/mvp-onboarding/page.tsx"), /\/development/);
  assert.ok(read("src/app/couple-activity/page.tsx").includes('active={accessDenied || targetPairMismatch ? null : displayedActive}'), 'activity data must be hidden after access denial or a notification pair mismatch');
  assert.match(read("src/features/sharedLife/SharedLifePage.tsx"), /data = pairAccessLost \? null : flow.data/);
  assert.match(read("src/features/sharedLife/SharedLifePage.tsx"), /editing = draft\?\.pairId === pair.pairId \? draft : null/);
  assert.doesNotMatch(read("src/client/hooks/useDevelopment.ts") + read("src/features/development/DevelopmentPage.tsx"), /localStorage/);
  console.log("Continuation UI self-check passed: resume, page coalescing/deduplication/retry, refresh races, scope invalidation, program order, partial/final and revoked access.");
};
void main().catch((error: Error) => { console.error(error); process.exitCode = 1; });
