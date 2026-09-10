import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath, symlink, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { prepareEvidenceDirectory, createVerifiedPatch, successfulAssertions, matchesAssertion, waitForCompletion, separatePriorAcceptanceEvidence, computeReadiness, requiredExecutionNames } from './beta-check.mjs';
import { evaluateBetaReleaseGates } from './lib/beta-release-gates.mjs';

const check = (assertion) => process.stdout.write(`${JSON.stringify({ suite: 'beta-check-integrity', status: 'PASSED', assertion })}\n`);
const parent = await realpath(tmpdir()), owned = await mkdtemp(join(parent, 'vmeste-evidence-sanity-'));
const repository = join(owned, 'repository'); await mkdir(repository);
const git = (...args) => { const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, 'Owned Git fixture command failed'); return result.stdout; };
try {
  const alias = join(owned, 'alias'); await symlink(repository, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => prepareEvidenceDirectory(repository, join(alias, 'must-not-create')));
  await assert.rejects(() => prepareEvidenceDirectory(repository, join(repository, '..shadow')));
  assert.equal((await readdir(repository)).length, 0, 'Invalid path must be rejected before source directories are created');
  const external = await prepareEvidenceDirectory(repository, join(owned, 'evidence')); await writeFile(join(external, 'existing'), '');
  await assert.rejects(() => prepareEvidenceDirectory(repository, external));
  check('canonical symlink and dot-dot-prefix output paths fail before source writes; reused evidence is rejected');

  const command = ['node', '--import', 'tsx', 'scripts/beta-content.selfcheck.ts'];
  const results = [
    { name: 'content', status: 'PASSED', command, receipts: [
      { suite: 'beta-content', status: 'passed', cases: [{ assertion: 'same-name' }, { assertion: 'failed-case', status: 'FAIL' }] },
      { suite: 'beta-content', status: 'running', assertion: 'not-done' }, { suite: 'beta-pair', status: 'passed', assertion: 'collision' },
      { suite: 'beta-check', status: 'PASSED', assertion: 'build', producer: 'scripts/beta-check.mjs' },
    ] },
    { name: 'harness', status: 'PASSED', command: ['node', 'scripts/local-acceptance.ts', '--suite=beta'], receipts: [
      { suite: 'beta-pair', sourceFile: 'scripts/beta-pair.integration.ts', status: 'passed', test: 'pair-case' },
      { suite: 'beta-sources', status: 'passed', stage: 'missing-origin' },
      { suite: 'beta-pair', sourceFile: 'scripts/beta-sources.integration.ts', status: 'passed', test: 'forged-origin' },
      { suite: 'assessment-comparison', sourceFile: 'scripts/assessment-comparison.integration.ts', status: 'passed', stage: 'INT-047 INT-048 retained successful guard cases' },
    ] },
    { name: 'retained-content', status: 'PASSED', command: ['node', 'npm-cli.js', 'run', 'selfcheck:assessment-content'], npmScript: 'selfcheck:assessment-content', npmEntryFile: 'scripts/assessment-content.selfcheck.ts', receipts: [
      { suite: 'assessment-content', status: 'passed', checks: 9, acceptance: ['INT-003', 'INT-004'] },
    ] },
    { name: 'failed', status: 'FAILED', command, receipts: [{ suite: 'beta-content', status: 'passed', assertion: 'failed-run' }] },
    { name: 'types', status: 'PASSED', producer: 'scripts/beta-check.mjs' },
    { name: 'lint', status: 'PASSED' },
    { name: 'agents', status: 'FAILED', producer: 'scripts/beta-check.mjs' },
    { name: 'unregistered-structural-name', status: 'PASSED', producer: 'scripts/beta-check.mjs' },
  ];
  const rows = successfulAssertions(results);
  assert.equal(matchesAssertion({ file: 'scripts/beta-content.selfcheck.ts', assertion: 'same-name' }, rows), true);
  assert.equal(matchesAssertion({ file: 'scripts/beta-pair.integration.ts', assertion: 'same-name' }, rows), false);
  assert.equal(matchesAssertion({ file: 'scripts/beta-pair.integration.ts', assertion: 'pair-case' }, rows), true);
  assert.equal(matchesAssertion({ file: 'scripts/beta-check.mjs', assertion: 'types' }, rows), true);
  assert.equal(matchesAssertion({ file: 'scripts/assessment-content.selfcheck.ts', assertion: 'INT-003' }, rows), true);
  assert.equal(matchesAssertion({ file: 'scripts/assessment-content.selfcheck.ts', assertion: 'summary:assessment-content' }, rows), true);
  assert.equal(matchesAssertion({ file: 'scripts/assessment-comparison.integration.ts', assertion: 'INT-047' }, rows), true);
  assert.equal(matchesAssertion({ file: 'scripts/assessment-content.selfcheck.ts', assertion: 'INT-047' }, rows), false);
  for (const name of ['failed-case', 'not-done', 'collision', 'missing-origin', 'forged-origin', 'failed-run', 'build', 'lint', 'agents', 'unregistered-structural-name']) assert.ok(!rows.some(row => row.assertion === name), 'Unsuccessful or unattributed receipt must not satisfy coverage');
  check('failed running collided or unattributed receipts cannot satisfy another script; structural passes require runner provenance');

  const historical = { id: 'INT-001', title: 'Retained requirement', status: 'PASSED', evidenceOfExecution: { result: 'Historical execution' }, testEvidence: [{ path: 'historical-script' }] };
  const freshDefinition = separatePriorAcceptanceEvidence(historical);
  assert.equal(Object.hasOwn(freshDefinition, 'status'), false);
  assert.equal(Object.hasOwn(freshDefinition, 'evidenceOfExecution'), false);
  assert.equal(Object.hasOwn(freshDefinition, 'testEvidence'), false);
  assert.equal(freshDefinition.priorReportedStatus, 'PASSED');
  assert.deepEqual(freshDefinition.priorReportedEvidence, { evidenceOfExecution: historical.evidenceOfExecution, testEvidence: historical.testEvidence });
  assert.equal(historical.status, 'PASSED');
  check('fresh INT definition exposes historical execution only as explicitly prior reported evidence');

  const readyExecutions = requiredExecutionNames.map(name => ({ name, status: 'PASSED', producer: 'scripts/beta-check.mjs' }));
  const betaCases = Array.from({ length: 126 }, (_, index) => ({ id: `BETA-${String(index + 1).padStart(3, '0')}`, implementationStatus: 'PASSED', tests: [], observed: [] }));
  for (const number of [93, 116, 126]) Object.assign(betaCases[number - 1], { implementationStatus: 'NOT_APPLICABLE_EXTERNAL', environmentStatus: 'BLOCKED_EXTERNAL' });
  betaCases[114].implementationStatus = 'NOT_RUN';
  const originalCases = Array.from({ length: 64 }, (_, index) => ({ id: `INT-${String(index + 1).padStart(3, '0')}`, status: 'PASSED' }));
  Object.assign(originalCases[23], { status: 'PARTIAL', observed: [{ assertion: 'browser accessibility' }], unverifiedSubparts: [{ layer: 'NATIVE_A11Y', status: 'NOT_RUN' }] });
  const fixture = { results: readyExecutions, betaCases, originalCases };
  const readiness = computeReadiness(fixture);
  assert.equal(readiness.implementationReady, true); assert.equal(readiness.environmentReady, false); assert.equal(readiness.privateBetaOpen, false);
  for (const name of requiredExecutionNames) {
    assert.equal(computeReadiness({ ...fixture, results: readyExecutions.filter(row => row.name !== name) }).implementationReady, false, 'Every required execution must be present');
    assert.equal(computeReadiness({ ...fixture, results: readyExecutions.map(row => row.name === name ? { ...row, status: 'FAILED' } : row) }).implementationReady, false, 'Every required execution must pass');
  }
  const invalidFixtures = [
    { ...fixture, results: [] }, { ...fixture, betaCases: betaCases.slice(1) }, { ...fixture, betaCases: [betaCases[1], ...betaCases.slice(1)] },
    { ...fixture, originalCases: originalCases.slice(1) }, { ...fixture, originalCases: [originalCases[1], ...originalCases.slice(1)] },
    ...['NOT_RUN', 'PARTIAL', 'FAILED', 'NOT_APPLICABLE_EXTERNAL'].map(implementationStatus => ({ ...fixture, betaCases: [{ ...betaCases[0], implementationStatus, environmentStatus: 'BLOCKED_EXTERNAL' }, ...betaCases.slice(1)] })),
    { ...fixture, originalCases: originalCases.map(row => row.id === 'INT-024' ? { ...row, observed: [] } : row) },
    { ...fixture, originalCases: originalCases.map(row => row.id === 'INT-024' ? { ...row, unverifiedSubparts: [{ layer: 'BROWSER', status: 'NOT_RUN' }] } : row) },
    { ...fixture, originalCases: originalCases.map(row => row.id === 'INT-001' ? { ...row, status: 'PARTIAL' } : row) },
    { ...fixture, betaCases: betaCases.map(row => row.id === 'BETA-115' ? { ...row, tests: [{ assertion: 'missing browser check' }] } : row) },
    { ...fixture, betaCases: betaCases.map(row => row.id === 'BETA-115' ? { ...row, unverifiedSubparts: [{ layer: 'BROWSER', status: 'NOT_RUN' }] } : row) },
    { ...fixture, results: readyExecutions.map(row => row.name === 'build' ? { ...row, producer: 'untrusted-receipt' } : row) },
    { ...fixture, results: [...readyExecutions, readyExecutions[0]] },
  ];
  for (const invalid of invalidFixtures) {
    const result = computeReadiness(invalid);
    assert.equal(result.implementationReady, false); assert.equal(result.environmentReady, false); assert.equal(result.privateBetaOpen, false);
  }
  check('readiness requires exact 126 and 64 coverage plus every critical execution; synthetic passes never open environment');

  const gateRequirements = JSON.parse(await readFile(new URL('../docs/assessment/BETA_RELEASE_GATES.requirements.json', import.meta.url), 'utf8'));
  const frozenGateTemplate = structuredClone(gateRequirements), gateRunId = 'owned-release-gate-selfcheck', gateSourceIdentity = 'a'.repeat(64);
  const gateCases = (prefix, count) => Array.from({ length: count }, (_, index) => {
    const id = `${prefix}-${String(index + 1).padStart(3, '0')}`, test = { file: 'scripts/owned-gate-fixture.mjs', assertion: id };
    return { id, status: 'PASSED', implementationStatus: 'PASSED', runId: gateRunId, sourceIdentity: gateSourceIdentity, tests: [test], observed: [{ ...test }], unverifiedSubparts: [] };
  });
  const currentBeta = gateCases('BETA', 126), currentOriginal = gateCases('INT', 64);
  for (const number of [93, 116, 126]) Object.assign(currentBeta[number - 1], { status: 'BLOCKED_EXTERNAL', implementationStatus: 'NOT_APPLICABLE_EXTERNAL', tests: [], observed: [] });
  Object.assign(currentBeta[114], { status: 'NOT_RUN', implementationStatus: 'NOT_RUN', tests: [], observed: [] });
  Object.assign(currentOriginal[23], { status: 'PARTIAL', unverifiedSubparts: [{ layer: 'NATIVE_A11Y', status: 'NOT_RUN' }] });
  const gateFixture = { requirements: gateRequirements, results: readyExecutions.map(row => ({ ...row, runId: gateRunId, sourceIdentity: gateSourceIdentity })), betaCases: currentBeta, originalCases: currentOriginal,
    readiness: { automaticPassed: true, implementationReady: true, missingCriticalExecutions: [], environmentReady: true, privateBetaOpen: true }, runId: gateRunId, sourceIdentity: gateSourceIdentity };
  const release = evaluateBetaReleaseGates(gateFixture), gate = (report, id) => report.gates.find(row => row.id === id);
  assert.equal(release.gates.length, 12); assert.equal(new Set(release.gates.map(row => row.id)).size, 12); assert.equal(release.implementationReady, true);
  for (const id of ['G01', 'G02', 'G03', 'G04']) { assert.equal(gate(release, id).status, 'PASSED'); assert.equal(gate(release, id).codeStatus, 'PASSED'); assert.ok(gate(release, id).evidence.some(row => row.kind === 'BETA')); }
  for (const id of ['G05', 'G09', 'G12']) { assert.equal(gate(release, id).codeStatus, 'PASSED'); assert.equal(gate(release, id).externalStatus, 'BLOCKED_EXTERNAL'); assert.equal(gate(release, id).status, 'BLOCKED_EXTERNAL'); }
  assert.equal(gate(release, 'G06').codeStatus, 'PASSED'); assert.equal(gate(release, 'G06').externalStatus, 'NOT_RUN'); assert.equal(gate(release, 'G06').status, 'PARTIAL');
  for (const id of ['G07', 'G08', 'G10', 'G11']) { assert.equal(gate(release, id).codeStatus, 'NOT_APPLICABLE'); assert.equal(gate(release, id).status, 'BLOCKED_EXTERNAL'); }
  assert.equal(release.environmentReady, false); assert.equal(release.privateBetaOpen, false); assert.equal(release.actualApprovalSource, 'NONE'); assert.deepEqual(gateRequirements, frozenGateTemplate);
  check('all twelve release gates preserve template and separate current code evidence native NOT_RUN and absent external approvals');

  const changedBeta = (id, patch) => currentBeta.map(row => row.id === id ? { ...row, ...patch } : row);
  for (const changed of [
    { betaCases: currentBeta.filter(row => row.id !== 'BETA-010') },
    { betaCases: [currentBeta[1], ...currentBeta.slice(1)] },
    { betaCases: changedBeta('BETA-024', { sourceIdentity: 'b'.repeat(64) }) },
    { betaCases: changedBeta('BETA-024', { runId: 'previous-run' }) },
    { betaCases: changedBeta('BETA-024', { observed: [] }) },
    { betaCases: changedBeta('BETA-024', { tests: [], observed: [] }) },
    { betaCases: changedBeta('BETA-024', { unverifiedSubparts: [{ layer: 'HTTP_DB', status: 'NOT_RUN' }] }) },
    { betaCases: changedBeta('BETA-084', { status: 'FAILED', implementationStatus: 'FAILED' }) },
    { originalCases: currentOriginal.filter(row => row.id !== 'INT-046') },
    { results: [] }, { sourceIdentity: 'unverified-tree' },
    { results: gateFixture.results.map(row => row.name === 'build' ? { ...row, producer: 'forged-receipt' } : row) },
    { results: gateFixture.results.map(row => row.name === 'unchanged-tested-tree' ? { ...row, status: 'FAILED' } : row) },
    { readiness: { ...gateFixture.readiness, missingCriticalExecutions: ['http-mongodb'] } },
  ]) {
    const evaluated = evaluateBetaReleaseGates({ ...gateFixture, ...changed });
    assert.equal(evaluated.implementationReady, false); assert.notEqual(gate(evaluated, 'G02').status, 'PASSED'); assert.equal(evaluated.environmentReady, false); assert.equal(evaluated.privateBetaOpen, false);
  }
  const keyboardFailure = evaluateBetaReleaseGates({ ...gateFixture, betaCases: changedBeta('BETA-109', { implementationStatus: 'FAILED', status: 'FAILED' }) });
  assert.equal(gate(keyboardFailure, 'G06').codeStatus, 'FAILED'); assert.equal(gate(keyboardFailure, 'G06').status, 'FAILED');
  const inventedNative = evaluateBetaReleaseGates({ ...gateFixture, betaCases: changedBeta('BETA-115', { implementationStatus: 'PASSED', status: 'PASSED' }) });
  assert.equal(gate(inventedNative, 'G06').externalStatus, 'NOT_RUN'); assert.equal(inventedNative.environmentReady, false);
  assert.throws(() => evaluateBetaReleaseGates({ ...gateFixture, requirements: { ...gateRequirements, gates: gateRequirements.gates.slice(1) } }), /TEMPLATE_INVALID/);
  assert.throws(() => evaluateBetaReleaseGates({ ...gateFixture, requirements: { ...gateRequirements, gates: gateRequirements.gates.map(row => row.id === 'G04' ? { ...row, required: false } : row) } }), /TEMPLATE_INVALID/);
  check('release gates reject missing failed foreign empty or weakened evidence and never let native gap mask failed browser code');

  git('init', '-q'); git('config', 'user.name', 'OwnedEvidenceTest'); git('config', 'user.email', 'owned@example.invalid'); git('config', 'core.autocrlf', 'false');
  await writeFile(join(repository, '.gitattributes'), '*.txt text eol=lf\n');
  await writeFile(join(repository, 'tracked.txt'), 'before\n'); await writeFile(join(repository, 'deleted.txt'), 'delete\n'); await writeFile(join(repository, 'renamed-from.txt'), 'rename\n');
  git('add', '.'); git('commit', '-qm', 'owned-base'); const head = git('rev-parse', 'HEAD').trim();
  await writeFile(join(repository, 'tracked.txt'), 'after\r\n'); await rm(join(repository, 'deleted.txt')); await rename(join(repository, 'renamed-from.txt'), join(repository, 'renamed-to.txt'));
  await writeFile(join(repository, 'new.txt'), 'new\r\n'); await writeFile(join(repository, 'binary.bin'), Buffer.from([0, 1, 255, 0]));
  const files = [];
  for (const path of ['.gitattributes', 'tracked.txt', 'new.txt', 'binary.bin', 'renamed-to.txt']) {
    const bytes = await readFile(join(repository, path)); files.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const directory = await prepareEvidenceDirectory(repository, join(owned, 'patch')), actualIndex = git('ls-files', '--stage');
  const result = await createVerifiedPatch(repository, head, files, directory);
  assert.equal(result.verified, true); assert.equal(result.verifiedFiles, 5); assert.equal(git('ls-files', '--stage'), actualIndex, 'Alternate indexes must preserve the actual user index');
  const manifest = JSON.parse(await readFile(join(directory, 'tested-manifest.git-normalized.json'), 'utf8'));
  assert.equal(manifest.length, 5); assert.ok(manifest.every(file => /^[a-f0-9]{40,64}$/.test(file.gitBlob)));
  check('actual alternate-index patch replay verifies new deleted renamed binary and CRLF-normalized source blobs without changing user index');
  const missingDirectory = await prepareEvidenceDirectory(repository, join(owned, 'patch-missing'));
  await assert.rejects(() => createVerifiedPatch(repository, head, files.slice(1), missingDirectory));
  const changedDirectory = await prepareEvidenceDirectory(repository, join(owned, 'patch-changed'));
  await writeFile(join(repository, 'tracked.txt'), 'changed-after-manifest\n');
  await assert.rejects(() => createVerifiedPatch(repository, head, files, changedDirectory));
  check('missing source path or source changed after manifest makes patch verification fail closed');

  const started = Date.now(); assert.deepEqual(await waitForCompletion(Promise.resolve(7), 20000), { completed: true, value: 7 }); assert.ok(Date.now() - started < 1000);
  const keepAlive = setTimeout(() => {}, 1000);
  try { assert.deepEqual(await waitForCompletion(new Promise(() => {}), 5), { completed: false }); } finally { clearTimeout(keepAlive); }
  check('completed teardown cancels long timer and unfinished teardown returns a bounded timeout');
} catch {
  process.stderr.write(`${JSON.stringify({ suite: 'beta-check-integrity', status: 'FAILED', code: 'EVIDENCE_INTEGRITY_ASSERTION_FAILED' })}\n`); process.exitCode = 1;
} finally {
  const actual = await realpath(owned); assert.ok(actual.startsWith(`${parent}${sep}`) && actual === resolve(owned)); await rm(actual, { recursive: true, force: true });
}
