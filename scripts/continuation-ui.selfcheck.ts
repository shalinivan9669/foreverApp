import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { developmentApi } from "@/client/api/development.api";
import { sharedLifeApi } from "@/client/api/sharedLife.api";
import { ApiClientError } from "@/client/api/errors";
import { developmentRunHref, developmentRunStatus, nextDevelopmentProgramStep, resumableDevelopmentRuns } from "@/client/viewmodels/development.viewmodels";
import { matchingConfirmationCopy } from "@/client/viewmodels/matching";
import type { DevelopmentDetailDTO, DevelopmentOverviewDTO, DevelopmentRunDTO } from "@/lib/dto/development.dto";
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
type Cell = object | boolean | null;
const cells: Array<{ value: Cell }> = [];
const cellValue = (index: number): Cell => cells[index].value;
const refs: Array<{ current: object | number | boolean | null }> = [];
let stateIndex = 0;
let refIndex = 0;
let effects: Array<() => void | (() => void)> = [];
let cleanups: Array<() => void> = [];
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
  cleanups.forEach((cleanup) => cleanup()); cleanups = []; effects = []; stateIndex = 0; refIndex = 0;
  const result = probe();
  for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
  return result;
};
const reset = () => { cleanups.forEach((cleanup) => cleanup()); cleanups = []; effects = []; cells.length = 0; refs.length = 0; };
const main = async () => {
  const originalDevelopment = { ...developmentApi };
  const originalSharedLife = { ...sharedLifeApi };
  stubHook("useState", <T extends Cell>(initial: T): [T, (value: T) => void] => {
    const index = stateIndex++; const cell = cells[index] ?? (cells[index] = { value: initial });
    return [cell.value as T, (value) => { cell.value = value; }];
  });
  stubHook("useRef", <T extends object | number | boolean | null>(initial: T) => {
    const index = refIndex++; return (refs[index] ?? (refs[index] = { current: initial })) as { current: T };
  });
  stubHook("useCallback", <T>(callback: T) => callback);
  stubHook("useEffect", (effect: () => void | (() => void)) => { effects.push(effect); });
  try {
    const { useDevelopment } = await import("@/client/hooks/useDevelopment");
    developmentApi.overview = async () => overview;
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
  assert.match(read("src/features/sharedLife/SharedLifePage.tsx"), /!editing && !deleteId/);
  assert.match(read("src/features/matching/MatchingConnectionPage.tsx"), /Promise\.all\(\[load\(\), connection.refetch\(\)\]\)/);
  assert.match(read("src/app/main-menu/page.tsx"), /<ContinuationPanel/);
  assert.match(read("src/app/mvp-onboarding/page.tsx"), /\/development/);
  assert.match(read("src/app/couple-activity/page.tsx"), /active=\{accessDenied \? null : activeVm\}/);
  assert.match(read("src/features/sharedLife/SharedLifePage.tsx"), /data = pairAccessLost \? null : flow.data/);
  assert.match(read("src/features/sharedLife/SharedLifePage.tsx"), /editing = draft\?\.pairId === pair.pairId \? draft : null/);
  assert.doesNotMatch(read("src/client/hooks/useDevelopment.ts") + read("src/features/development/DevelopmentPage.tsx"), /localStorage/);
  console.log("Continuation UI self-check passed: resume, program order, partial/final, revoked access and request races.");
};
void main().catch((error: Error) => { console.error(error); process.exitCode = 1; });
