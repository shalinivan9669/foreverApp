import assert from "node:assert/strict";
import React from "react";
import { pairInvitesApi, type PairInviteAcceptDTO, type PairInviteAvailabilityDTO } from "@/client/api/pairInvites.api";
import { entryApi, type EntryStateDTO } from "@/client/api/entry.api";
import { ApiClientError } from "@/client/api/errors";
import { parsePairInviteInput } from "@/client/viewmodels/pairInviteAcceptance";

const code = "VM-AAAAAAAA-BBBBBBBB-CCCCCCCC";
const token = "a".repeat(43);
assert.deepEqual(parsePairInviteInput(` ${code.toLowerCase()} `), { partnerCode: code });
assert.deepEqual(parsePairInviteInput(`https://example.test/join#token=${token}`), { token });
assert.deepEqual(parsePairInviteInput(`/join#partnerCode=${code}`), { partnerCode: code });
assert.equal(parsePairInviteInput("javascript:alert(1)"), null);
assert.equal(parsePairInviteInput(`https://example.test/settings#token=${token}`), null);
assert.equal(parsePairInviteInput(`https://example.test/join?token=${token}`), null);
assert.equal(parsePairInviteInput("short-invalid-code"), null);

// The real hook executes with deferred typed APIs; this adapter replaces only
// React scheduling and never authenticates against an external environment.
type Cell = object | string | number | boolean | null | undefined;
const cells: Array<{ value: Cell }> = [];
const refs: Array<{ current: Cell }> = [];
const callbacks: Array<{ deps: readonly Cell[]; value: object }> = [];
const effects: Array<{ deps?: readonly Cell[]; cleanup?: () => void }> = [];
let stateIndex = 0; let refIndex = 0; let callbackIndex = 0; let effectIndex = 0;
let queued: Array<() => void> = [];
const same = (a?: readonly Cell[], b?: readonly Cell[]) => Boolean(a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i])));
const originals: Array<{ key: string; descriptor?: PropertyDescriptor }> = [];
const replace = (key: string, value: object) => { originals.push({ key, descriptor: Object.getOwnPropertyDescriptor(React, key) }); Object.defineProperty(React, key, { configurable: true, value }); };
const tick = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const entry: EntryStateDTO = { user: { id: "actor", publicId: "VM-DDDDDDDD-EEEEEEEE-FFFFFFFF", username: "Участник", avatar: "", entryCohort: "EXISTING_PARTNER", entryCompletedAt: "2026-09-09T00:00:00Z" }, hasPair: false, onboardingCompleted: true, cityCatalogVersion: "synthetic", searchCities: [] };
const available: PairInviteAvailabilityDTO = { availability: "available", partner: { publicId: code, username: "Партнёр" } };

async function run() {
  const originalInvites = { ...pairInvitesApi }; const originalEntry = { ...entryApi };
  replace("useState", <T extends Cell>(initial: T): [T, (next: T | ((value: T) => T)) => void] => { const i = stateIndex++; const cell = cells[i] ?? (cells[i] = { value: initial }); return [cell.value as T, (next) => { cell.value = typeof next === "function" ? next(cell.value as T) : next; }]; });
  replace("useRef", <T extends Cell>(initial: T) => { const i = refIndex++; return (refs[i] ?? (refs[i] = { current: initial })) as { current: T }; });
  replace("useCallback", <T extends object>(value: T, deps: readonly Cell[]): T => { const i = callbackIndex++; const previous = callbacks[i]; if (previous && same(previous.deps, deps)) return previous.value as T; callbacks[i] = { value, deps }; return value; });
  replace("useEffect", (effect: () => void | (() => void), deps?: readonly Cell[]) => { const i = effectIndex++; const previous = effects[i]; if (previous && same(previous.deps, deps)) return; queued.push(() => { previous?.cleanup?.(); const cleanup = effect(); effects[i] = { deps, ...(cleanup ? { cleanup } : {}) }; }); });
  const reset = () => { effects.forEach((effect) => effect.cleanup?.()); effects.length = 0; cells.length = 0; refs.length = 0; callbacks.length = 0; };
  try {
    const { usePairInviteAcceptance } = await import("@/client/hooks/usePairInviteAcceptance");
    let pairRefreshes = 0;
    const refreshPair = async () => { pairRefreshes += 1; };
    const renderHook = <T,>(probe: () => T) => { stateIndex = 0; refIndex = 0; callbackIndex = 0; effectIndex = 0; queued = []; const result = probe(); queued.forEach((effect) => effect()); return result; };
    const render = () => renderHook(() => usePairInviteAcceptance("actor", refreshPair));
    let accepts = 0; let lookups = 0;
    entryApi.get = async () => entry;
    pairInvitesApi.resolve = async () => { lookups += 1; return available; };
    pairInvitesApi.accept = async () => { accepts += 1; return { status: "AWAITING_PARTNER_CONFIRMATION" }; };
    render().changeValue("invalid");
    assert.equal(await render().inspect(), false);
    assert.equal(lookups, 0, "invalid input cannot issue a private request");
    render().changeValue(code); await render().inspect();
    assert.equal(render().phase, "available");
    assert.equal(accepts, 0, "lookup must never accept automatically");
    assert.equal(await render().accept(), false, "identity requires explicit checkbox");
    render().setConfirmed(true); await render().accept();
    assert.equal(render().phase, "waiting_confirmation");
    assert.equal(render().confirmed, false);
    assert.equal(accepts, 1);
    assert.equal(await render().accept(), false, "waiting state cannot repeat acceptance");
    pairInvitesApi.resolve = async () => ({ availability: "accepted", pairId: "created-pair" });
    await render().inspect();
    assert.equal(render().phase, "accepted");
    assert.equal(render().invite?.pairId, "created-pair");
    assert.ok(pairRefreshes >= 2);

    for (const prerequisite of ["entry", "onboarding", "pair"] as const) {
      reset(); pairInvitesApi.resolve = async () => available;
      entryApi.get = async () => ({ ...entry, hasPair: prerequisite === "pair", onboardingCompleted: prerequisite !== "onboarding", user: prerequisite === "entry" ? { ...entry.user, entryCohort: "SOLO" } : entry.user });
      render().changeValue(code); await render().inspect();
      assert.equal(render().phase, prerequisite === "entry" ? "entry_required" : prerequisite === "onboarding" ? "onboarding_required" : "unavailable");
      render().setConfirmed(true);
      assert.equal(await render().accept(), false, `${prerequisite} prerequisite cannot be bypassed by setting confirmation`);
      if (prerequisite !== "pair") assert.match(render().setupHref, /#return=join&partnerCode=/);
    }

    reset(); entryApi.get = async () => entry;
    render().changeValue(code); await render().inspect(); render().setConfirmed(true);
    const ack = deferred<PairInviteAcceptDTO>();
    pairInvitesApi.accept = async () => { accepts += 1; return ack.promise; };
    const first = render().accept(); await tick();
    assert.equal(await render().accept(), false, "double click cannot issue another mutation");
    render().changeValue("replacement");
    assert.equal(render().value, code, "a pending write retains its confirmed invite scope");
    const beforeUnmountRefreshes = pairRefreshes;
    reset(); ack.resolve({ status: "ACCEPTED", pairId: "late-pair" });
    assert.equal(await first, false);
    assert.equal(pairRefreshes, beforeUnmountRefreshes, "late unmounted mutation cannot overwrite another profile screen");

    reset(); pairInvitesApi.resolve = async () => available;
    render().changeValue(code); await render().inspect(); render().setConfirmed(true);
    pairInvitesApi.accept = async () => { throw new ApiClientError({ status: 409, code: "PAIR_ALREADY_ACTIVE", message: "У вас уже есть пара." }); };
    assert.equal(await render().accept(), false);
    assert.equal(render().invite, null);
    assert.equal(render().confirmed, false);
    assert.equal(render().phase, "idle");
    assert.match(render().error ?? "", /У вас уже есть пара/);
    console.log("Profile pair invite self-check passed: local parsing, explicit acceptance, mutual confirmation waiting, prerequisites, active membership, duplicate write and unmount fencing.");
  } finally {
    reset(); Object.assign(pairInvitesApi, originalInvites); Object.assign(entryApi, originalEntry);
    for (const original of originals.reverse()) if (original.descriptor) Object.defineProperty(React, original.key, original.descriptor);
  }
}
void run().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
