import assert from 'node:assert/strict';
import React from 'react';
import { assessmentApi } from '@/client/api/assessment';
import { usersApi } from '@/client/api/users.api';
import { ApiClientError } from '@/client/api/errors';
import type { AssessmentRunDTO, AssessmentMutation } from '@/lib/dto/assessment.dto';
import type { AssessmentComparisonDTO } from '@/lib/dto/assessmentComparison.dto';
import type { AssessmentPairDTO } from '@/lib/dto/assessmentPair.dto';

// Production hook, deterministic React plumbing and API completion timing.
// This regression is independent of the actual HTTP/Mongo and browser suites.
type Cell = object | boolean | string | number | null;
const states: Cell[] = [], refs: Array<{ current: Cell }> = [];
const effects: Array<() => (() => void)> = [];
let stateIndex = 0, refIndex = 0, firstRender = true;
const descriptors: Array<{ key: string; descriptor?: PropertyDescriptor }> = [];
function hook(key: string, value: object) { descriptors.push({ key, descriptor: Object.getOwnPropertyDescriptor(React, key) }); Object.defineProperty(React, key, { configurable: true, writable: true, value }); }
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const run: AssessmentRunDTO = { viewerToken: 'a'.repeat(64), publication: { id: 'synthetic', version: 'draft', title: 'Synthetic', status: 'DRAFT', policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED' }, status: 'DRAFT', revision: 5, calculation: 'NOT_STARTED', period: null, pairUse: true, matchingUse: true, permissionRevision: 2, answers: [], items: [], presentation: null, profile: null };
const comparison: AssessmentComparisonDTO = { intentToken: 'b'.repeat(64), direct: { revision: 4, permissionRevision: 2, answers: null, period: null, pairUse: true, useForComparison: true }, context: null, availability: 'UNAVAILABLE', current: null, scenarios: [] };
const pair: AssessmentPairDTO = { context: { pairId: 'c'.repeat(24), viewerToken: 'd'.repeat(64) }, availability: 'UNAVAILABLE', revision: 3, myRole: null, agreement: null, periods: [], reports: [] };
async function main() {
  const originalApi = { ...assessmentApi }, originalUser = usersApi.getCurrentUser;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let cleanup: (() => void) | undefined;
  hook('useState', <T extends Cell>(initial: T): [T, (value: T) => void] => { const index = stateIndex++; if (firstRender) states[index] = initial; return [states[index] as T, value => { states[index] = value; }]; });
  hook('useRef', <T extends Cell>(initial: T): { current: T } => { const index = refIndex++; if (firstRender) refs[index] = { current: initial }; return refs[index] as { current: T }; });
  hook('useEffect', (effect: () => (() => void)) => { if (firstRender) effects.push(effect); });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { visibilityState: 'visible' }) });
  try {
    const { useAssessmentPrivacy } = await import('@/client/hooks/useAssessmentPrivacy');
    function HookProbe() { stateIndex = 0; refIndex = 0; const value = useAssessmentPrivacy(); firstRender = false; return value; }
    let state = HookProbe(), reads = 0, writes = 0;
    const actor = { id: 'synthetic-A', username: 'Synthetic', avatar: '' };
    usersApi.getCurrentUser = async () => actor;
    assessmentApi.controls = async () => { reads++; return run; };
    assessmentApi.comparisonControls = async () => { reads++; return comparison; };
    assessmentApi.pairControls = async () => { reads++; return pair; };
    cleanup = effects[0](); await tick();
    assert.equal(reads, 0, 'privacy data is loaded only after an explicit click');
    await state.load(); state = HookProbe();
    assert.equal(reads, 3);
    assert.equal(state.data?.ownerId, actor.id);
    assert.equal(state.data?.run?.matchingUse, true);
    const requests: AssessmentMutation[] = [];
    assessmentApi.mutate = async body => { requests.push(body); writes++; throw new Error('synthetic network failure'); };
    assert.equal(await state.mutate('revoke-run-matching'), false);
    state = HookProbe(); assert.equal(state.saved, false);
    assessmentApi.mutate = async body => { requests.push(body); writes++; return { ...run, matchingUse: false, revision: 6 }; };
    assessmentApi.controls = async () => ({ ...run, matchingUse: false, revision: 6 });
    assert.equal(await state.mutate('revoke-run-matching'), true);
    assert.deepEqual(requests[0], requests[1], 'same failed privacy intent retains its exact receipt and viewer binding');
    assert.equal(requests[0].viewerToken, run.viewerToken);
    state = HookProbe(); assert.equal(state.saved, true); assert.equal(state.data?.run?.matchingUse, false);
    window.dispatchEvent(new Event('blur')); state = HookProbe();
    assert.equal(state.data, null, 'leaving the surface clears account privacy state'); assert.equal(state.saved, false);
    let resolve!: (value: AssessmentRunDTO) => void;
    assessmentApi.controls = () => new Promise<AssessmentRunDTO>(yes => { resolve = yes; });
    const delayed = state.load(); await tick();
    window.dispatchEvent(new Event('blur'));
    resolve(run); await delayed; state = HookProbe();
    assert.equal(state.data, null, 'late controls read cannot restore hidden account state');
    assessmentApi.controls = async () => run;
    await state.load(); state = HookProbe();
    usersApi.getCurrentUser = async () => { throw new ApiClientError({ status: 401, code: 'AUTH_REQUIRED', message: 'unauthorized' }); };
    assert.equal(await state.mutate('delete-run'), false);
    state = HookProbe(); assert.equal(state.data, null); assert.equal(writes, 2, 'expired session cannot dispatch a privacy mutation');
    assert.equal(state.error, 'Сессия завершена. Войдите снова.');
    usersApi.getCurrentUser = async () => actor;
    await state.load(); state = HookProbe();
    assessmentApi.mutate = async () => { writes++; return run; };
    assessmentApi.controls = async () => { throw new ApiClientError({ status: 401, code: 'AUTH_REQUIRED', message: 'unauthorized' }); };
    assert.equal(await state.mutate('delete-run'), false);
    state = HookProbe(); assert.equal(state.data, null); assert.equal(state.saved, false, 'a post-commit session expiry clears the prior account acknowledgement');
    assert.equal(writes, 3);
    assessmentApi.controls = async () => run;
    await state.load(); state = HookProbe();
    let identityReads = 0;
    usersApi.getCurrentUser = async () => ++identityReads <= 2 ? actor : { ...actor, id: 'synthetic-B' };
    assert.equal(await state.mutate('delete-run'), false);
    state = HookProbe(); assert.equal(state.data, null);
    assert.equal(state.saved, false, 'post200 controls A-to-B identity change must not display the old account acknowledgement');
    assert.equal(writes, 4);
    process.stdout.write(`${JSON.stringify({ suite: 'assessment-privacy-ui', status: 'passed', checks: 26, scope: 'REAL_HOOK_WITH_REACT_AND_API_ADAPTERS_NOT_BROWSER' })}\n`);
  } finally {
    cleanup?.(); Object.assign(assessmentApi, originalApi); usersApi.getCurrentUser = originalUser;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
    for (const { key, descriptor } of descriptors.reverse()) if (descriptor) Object.defineProperty(React, key, descriptor); else Reflect.deleteProperty(React, key);
  }
}
void main().catch((error: Error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
