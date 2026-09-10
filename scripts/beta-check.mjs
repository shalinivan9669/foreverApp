/** One command, isolated database lifecycles and evidence bound to byte-exact source files. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, realpath, lstat, readlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateBetaReleaseGates } from './lib/beta-release-gates.mjs';

const sourcePathAllowed = path => !/(^|\/)(\.env[^/]*|node_modules|\.next|coverage|\.git)(\/|$)/.test(path);
const outside = (root, path) => { const value = relative(root, path); return value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value); };
async function canonicalFuturePath(path) {
  try { return await realpath(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; const parent = dirname(path); assert.notEqual(parent, path); return resolve(await canonicalFuturePath(parent), relative(parent, path)); }
}
export async function prepareEvidenceDirectory(repository, requested, requireEmpty = true) {
  const canonicalRoot = await realpath(repository), prospective = await canonicalFuturePath(resolve(requested));
  assert.ok(outside(canonicalRoot, prospective), 'Evidence must be canonically outside source tree');
  await mkdir(prospective, { recursive: true });
  const directory = await realpath(prospective);
  assert.ok(outside(canonicalRoot, directory), 'Evidence symlink points inside source tree');
  if (requireEmpty) assert.equal((await readdir(directory)).length, 0, 'Use a new empty evidence directory; previous receipts cannot be reused');
  return directory;
}
export async function waitForCompletion(completion, milliseconds) {
  let timer;
  try { return await Promise.race([completion.then(value => ({ completed: true, value })), new Promise(done => { timer = setTimeout(() => done({ completed: false }), milliseconds); timer.unref(); })]); }
  finally { clearTimeout(timer); }
}
const suiteFiles = {
  'assessment': 'scripts/assessment.integration.ts', 'assessment-comparison': 'scripts/assessment-comparison.integration.ts',
  'assessment-ui': 'scripts/assessment-ui.selfcheck.ts', 'assessment-content': 'scripts/assessment-content.selfcheck.ts', 'assessment-profile-ui': 'scripts/assessment-profile-ui.selfcheck.ts', 'assessment-privacy-ui': 'scripts/assessment-privacy-ui.selfcheck.ts', 'assessment-reference': 'scripts/assessment-reference/run.mjs',
  'beta-sources': 'scripts/beta-sources.integration.ts', 'beta-pair': 'scripts/beta-pair.integration.ts', 'beta-feed': 'scripts/beta-feed.integration.ts',
  'beta-load': 'scripts/beta-load.integration.ts', 'beta-ops': 'scripts/beta-ops.integration.ts',
  'beta-content': 'scripts/beta-content.selfcheck.ts', 'beta-content-profile-ui': 'scripts/beta-content-profile-ui.selfcheck.ts',
  'beta-comparison': 'scripts/beta-comparison.selfcheck.ts', 'beta-session': 'scripts/beta-session.selfcheck.ts', 'beta-browser': 'scripts/beta-browser.mjs', 'beta-feed-browser': 'scripts/beta-feed-browser.mjs',
  'beta-delivery': 'scripts/beta-delivery.selfcheck.mjs', 'beta-check-integrity': 'scripts/beta-check.integrity.selfcheck.mjs',
};
const structuralResults = new Set(['types', 'lint', 'agents', 'build', 'unchanged-tested-tree', 'complete-patch-applied-and-blobs-verified', 'browser-cleanup', 'browser-feed-cleanup', 'browser-artifact-identity', 'browser-feed-artifact-identity', 'mongod-runtime-version']);
const passed = status => typeof status === 'string' && ['PASS', 'PASSED'].includes(status.toUpperCase());
function originatingFile(result, row) {
  const source = suiteFiles[row.suite]; if (!source) return null;
  if (result.npmEntryFile === source && result.command.includes('run') && result.command.includes(result.npmScript)) return row.sourceFile && row.sourceFile !== source ? null : source;
  if (result.command.includes(source)) return row.sourceFile && row.sourceFile !== source ? null : source;
  if (!result.command.includes('scripts/local-acceptance.ts') || row.sourceFile !== source) return null;
  const allowed = result.command.includes('--suite=beta-load') ? ['beta-load'] : result.command.includes('--suite=beta') ? ['assessment', 'assessment-comparison', 'beta-sources', 'beta-pair', 'beta-feed'] : [];
  return allowed.includes(row.suite) ? source : null;
}
export function successfulAssertions(results) {
  const assertions = [];
  for (const result of results) {
    if (result.status !== 'PASSED') continue;
    if (result.producer === 'scripts/beta-check.mjs' && structuralResults.has(result.name)) assertions.push({ file: 'scripts/beta-check.mjs', suite: 'beta-check', assertion: result.name, result: result.name });
    if (!Array.isArray(result.command)) continue;
    for (const row of result.receipts ?? []) {
      if (!passed(row.status)) continue;
      const file = originatingFile(result, row); if (!file) continue;
      const append = item => {
        const ids = ['acceptance', 'acceptanceIds', 'ids'].flatMap(key => Array.isArray(item[key]) ? item[key].filter(value => typeof value === 'string' && /^(INT|BETA)-\d{3}$/.test(value)) : []);
        // Retained comparison integration encodes its exact case IDs as a leading stage prefix.
        if (row.suite === 'assessment-comparison' && typeof item.stage === 'string') ids.push(...(item.stage.match(/^(?:INT-\d{3}\s+)+/)?.[0].match(/INT-\d{3}/g) ?? []));
        for (const name of [item.assertion, item.test, item.stage, item.name, item.id, ...ids]) if (typeof name === 'string') assertions.push({ file, suite: row.suite, assertion: name, result: result.name });
      };
      append(row);
      if ([row.tests, row.checks, row.assertions].some(value => Number.isInteger(value) && value > 0)) assertions.push({ file, suite: row.suite, assertion: `summary:${row.suite}`, result: result.name });
      // Named cases in a successful summary inherit success only when they do not carry a contrary status.
      for (const item of row.cases ?? []) if (item && typeof item === 'object' && (item.status === undefined || passed(item.status))) append(item);
    }
  }
  return assertions;
}
export function matchesAssertion(test, assertions) {
  const file = test.runner ?? test.file, name = test.assertion ?? test.test;
  return typeof file === 'string' && typeof name === 'string' && assertions.some(row => row.file === file && row.assertion === name && (!test.suite || test.suite === row.suite));
}
export function separatePriorAcceptanceEvidence(requirement) {
  const { status, evidenceOfExecution, testEvidence, ...definition } = requirement;
  return { ...definition, priorReportedStatus: status, priorReportedEvidence: { evidenceOfExecution, testEvidence } };
}
// Missing executions must fail even if every result that happens to exist passed.
export const requiredExecutionNames = Object.freeze([
  'types', 'lint', 'agents', 'assessment-reference', 'assessment-content', 'assessment-boundaries', 'assessment-ui', 'assessment-profile-ui', 'assessment-privacy-ui',
  'local-acceptance', 'security-critical', 'notifications', 'notifications-pagination', 'client-errors', 'client-request-race', 'matching-disclosure', 'matching-social',
  'beta-content', 'beta-content-profile-ui', 'beta-comparison', 'beta-session', 'beta-check.integrity', 'beta-delivery', 'build',
  'http-mongodb', 'operations', 'load', 'browser', 'browser-feed', 'browser-cleanup', 'browser-feed-cleanup', 'browser-artifact-identity', 'browser-feed-artifact-identity',
  'mongod-runtime-version', 'unchanged-tested-tree', 'complete-patch-applied-and-blobs-verified',
]);
export function computeReadiness({ results, betaCases, originalCases }) {
  const exactIds = (rows, prefix, count) => rows.length === count && new Set(rows.map(row => row.id)).size === count && Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(3, '0')}`).every(id => rows.some(row => row.id === id));
  const missingCriticalExecutions = requiredExecutionNames.filter(name => results.filter(row => row.name === name && row.producer === 'scripts/beta-check.mjs' && row.status === 'PASSED').length !== 1);
  const automaticPassed = missingCriticalExecutions.length === 0 && results.every(result => result.status === 'PASSED');
  const completeCoverage = exactIds(betaCases, 'BETA', 126) && exactIds(originalCases, 'INT', 64);
  const externalOnly = new Set(['BETA-093', 'BETA-116', 'BETA-126']);
  const codePassed = betaCases.every(row => {
    if (row.id === 'BETA-115') return ['NOT_RUN', 'PARTIAL', 'PASSED'].includes(row.implementationStatus) && (row.tests ?? []).length === (row.observed ?? []).length && (row.unverifiedSubparts ?? []).every(part => part.layer === 'NATIVE_A11Y');
    if (externalOnly.has(row.id)) return row.implementationStatus === 'NOT_APPLICABLE_EXTERNAL' && row.environmentStatus === 'BLOCKED_EXTERNAL' && (row.tests ?? []).length === 0;
    return row.implementationStatus === 'PASSED';
  });
  const retainedPassed = originalCases.every(row => row.status === 'PASSED' || (row.id === 'INT-024' && row.status === 'PARTIAL' && row.observed?.length > 0 && row.unverifiedSubparts?.length > 0 && row.unverifiedSubparts.every(part => part.layer === 'NATIVE_A11Y')));
  return { automaticPassed, implementationReady: automaticPassed && completeCoverage && codePassed && retainedPassed, environmentReady: false, privateBetaOpen: false, completeCoverage, missingCriticalExecutions };
}
function gitAt(repository, args, options = {}) {
  const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `git ${args[0]} failed`); return result.stdout;
}
export async function createVerifiedPatch(repository, head, expectedFiles, directory) {
  const stageEnv = { ...process.env, GIT_INDEX_FILE: resolve(directory, 'patch-source.index') }, verifyEnv = { ...process.env, GIT_INDEX_FILE: resolve(directory, 'patch-verification.index') };
  gitAt(repository, ['read-tree', head], { env: stageEnv });
  const changed = [...new Set([...gitAt(repository, ['diff', '--no-renames', '--name-only', '-z', head]).split('\0'), ...gitAt(repository, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')])].filter(path => path && sourcePathAllowed(path));
  for (let index = 0; index < changed.length; index += 50) gitAt(repository, ['--literal-pathspecs', 'add', '--all', '--', ...changed.slice(index, index + 50)], { env: stageEnv });
  const patch = gitAt(repository, ['diff', '--cached', '--binary', '--full-index', head], { env: stageEnv });
  const patchPath = resolve(directory, 'private-beta.patch'); await writeFile(patchPath, patch, { flag: 'wx' });
  gitAt(repository, ['read-tree', head], { env: verifyEnv });
  if (patch.length) gitAt(repository, ['apply', '--cached', patchPath], { env: verifyEnv });
  const entries = new Map(gitAt(repository, ['ls-files', '--stage', '-z'], { env: verifyEnv }).split('\0').filter(Boolean).map(line => { const tab = line.indexOf('\t'), [mode, blob, stage] = line.slice(0, tab).split(' '); assert.equal(stage, '0'); return [line.slice(tab + 1), { mode, blob }]; }));
  const normalized = [];
  for (const file of expectedFiles) {
    const absolute = resolve(repository, file.path), info = await lstat(absolute);
    const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, 'Source changed while generating patch');
    const expectedBlob = gitAt(repository, info.isSymbolicLink() ? ['hash-object', '--stdin'] : ['hash-object', `--path=${file.path}`, '--stdin'], { input: bytes }).trim();
    const actual = entries.get(file.path); assert.ok(actual, 'Patch omits an expected source path');
    assert.equal(actual.blob, expectedBlob, `Applied patch blob differs for ${file.path}`);
    if (info.isSymbolicLink()) assert.equal(actual.mode, '120000');
    normalized.push({ ...file, gitBlob: expectedBlob, gitMode: actual.mode });
  }
  assert.deepEqual([...entries.keys()].filter(sourcePathAllowed).sort(), expectedFiles.map(file => file.path).sort(), 'Patch paths differ from expected final source set');
  const appliedTree = gitAt(repository, ['write-tree'], { env: verifyEnv }).trim();
  assert.equal(appliedTree, gitAt(repository, ['write-tree'], { env: stageEnv }).trim(), 'Patch replay differs from staged normalized tree');
  await writeFile(resolve(directory, 'tested-manifest.git-normalized.json'), JSON.stringify(normalized, null, 2), { flag: 'wx' });
  return { file: 'private-beta.patch', sha256: createHash('sha256').update(patch).digest('hex'), appliesToHead: head, verified: true, appliedTree, verifiedFiles: normalized.length };
}
export async function runtimeVersions(root, mongod, browserModule) {
  const packages = {};
  for (const name of ['next', 'react', 'mongoose', 'zod', 'typescript', 'tsx']) {
    try { const value = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version; packages[name] = /^[a-zA-Z0-9.+-]{1,80}$/.test(value) ? value : 'UNAVAILABLE'; } catch { packages[name] = 'UNAVAILABLE'; }
  }
  const mongo = { status: 'NOT_REQUESTED' };
  if (mongod) {
    const path = await realpath(mongod), value = spawnSync(path, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 65536 });
    const version = /^db version v([a-zA-Z0-9.+-]+)/m.exec(value.stdout ?? '')?.[1];
    Object.assign(mongo, { status: value.status === 0 && version ? 'VERIFIED' : 'UNAVAILABLE', version: version ?? null, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
  let browserPackageVersion = null;
  if (browserModule) {
    let directory = dirname(await realpath(browserModule));
    while (dirname(directory) !== directory) { try { const value = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')); if (typeof value.version === 'string' && /^[a-zA-Z0-9.+-]{1,80}$/.test(value.version)) { browserPackageVersion = value.version; break; } } catch { /* Continue to the external package root. */ } directory = dirname(directory); }
  }
  return { node: process.version, platform: process.platform, arch: process.arch, git: gitAt(root, ['--version']).trim(), packages, mongod: mongo, browserPackageVersion };
}

async function main() {
const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const options = Object.fromEntries(process.argv.slice(2).map(value => { const index = value.indexOf('='); assert.ok(index > 2, 'Use --name=value'); return [value.slice(2, index), value.slice(index + 1)]; }));
for (const key of Object.keys(options)) assert.ok(['mongod', 'browser-module', 'output', 'scope'].includes(key), 'Unknown beta check option');
const mongod = options.mongod ?? process.env.LOCAL_ACCEPTANCE_MONGOD;
const browserModule = options['browser-module'] ?? process.env.BETA_PLAYWRIGHT_MODULE;
const scope = options.scope ?? 'full'; assert.ok(scope === 'full' || scope === 'code');
if (scope === 'full') { assert.ok(mongod && isAbsolute(mongod), 'Full check requires explicit absolute mongod'); assert.ok(browserModule && isAbsolute(browserModule), 'Full check requires explicit external Playwright module'); }
const output = await prepareEvidenceDirectory(root, resolve(options.output ?? `../foreverApp-beta-evidence-${randomUUID()}`));
const runId = randomUUID();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(result.status, 0, `git ${args[0]} failed`); return result.stdout; };
async function identity() {
  const paths = [...new Set([...git('ls-files', '-z').split('\0'), ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')])].filter(Boolean).sort();
  const files = [];
  for (const path of paths) {
    if (!sourcePathAllowed(path)) continue;
    try { const absolute = resolve(root, path), info = await lstat(absolute); const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute); files.push({ path, sha256: sha(bytes), bytes: bytes.length }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { branch: git('branch', '--show-current').trim(), head: git('rev-parse', 'HEAD').trim(), gitTree: git('rev-parse', 'HEAD^{tree}').trim(), status: git('status', '--porcelain=v1'), files, sourceIdentity: sha(JSON.stringify(files)) };
}
const before = await identity(); await writeFile(resolve(output, 'tested-manifest.before.json'), JSON.stringify(before, null, 2));
const results = [];
const versions = await runtimeVersions(root, mongod, browserModule);
if (scope === 'full') results.push({ name: 'mongod-runtime-version', layer: 'HARNESS', status: versions.mongod.status === 'VERIFIED' ? 'PASSED' : 'FAILED' });
const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', BETA_EVIDENCE_DIR: output };
const completions = new WeakMap();
function launch(command, args) {
  const child = spawn(command, args, { cwd: root, env: environment, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  completions.set(child, new Promise(done => { child.once('error', () => done(-1)); child.once('close', code => done(code)); }));
  return child;
}
const stops = new WeakMap();
function stopOwned(child) {
  if (stops.has(child)) return stops.get(child);
  const stopping = stopOwnedOnce(child); stops.set(child, stopping); return stopping;
}
async function stopOwnedOnce(child) {
  if (child.exitCode !== null || child.signalCode !== null) return false;
  child.stdin.on('error', () => undefined); if (!child.stdin.destroyed) child.stdin.write('stop\n');
  if ((await waitForCompletion(completions.get(child), 20000)).completed) return false;
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    if (process.platform === 'win32') spawnSync(resolve(process.env.SystemRoot ?? 'C:/Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } }
  }
  const closed = await waitForCompletion(completions.get(child), 5000);
  if (!closed.completed) {
    // A failed OS termination cannot keep evidence generation waiting forever or become a passing cleanup.
    child.kill('SIGKILL'); child.unref(); child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
  }
  return true;
}
function safeReceipt(row) {
  if (!row || typeof row !== 'object' || (!row.suite && !row.id)) return null;
  const result = {};
  for (const key of ['suite', 'sourceFile', 'status', 'id', 'name', 'test', 'assertion', 'stage', 'layer']) if (typeof row[key] === 'string' && row[key].length <= 600) result[key] = row[key];
  for (const key of ['tests', 'checks', 'completedCases', 'assertions', 'durationMs']) if (typeof row[key] === 'number' && Number.isFinite(row[key])) result[key] = row[key];
  for (const key of ['acceptance', 'acceptanceIds', 'ids']) if (Array.isArray(row[key])) result[key] = row[key].filter(value => typeof value === 'string' && /^(INT|BETA)-\d{3}$/.test(value));
  if (Array.isArray(row.cases)) result.cases = row.cases.map(value => typeof value === 'string' ? { assertion: value.slice(0, 600) } : safeReceipt({ suite: row.suite, ...value })).filter(Boolean);
  return result;
}
async function run(name, layer, args, timeout = 300000, npmSource = {}) {
  process.stdout.write(`${JSON.stringify({ suite: 'beta-check', status: 'RUNNING', name, layer })}\n`);
  const started = Date.now(), child = launch(process.execPath, args); let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  let timedOut = false, forced = false, stopping, timer;
  const deadline = new Promise(done => { timer = setTimeout(() => { timedOut = true; stopping = stopOwned(child); void stopping.then(() => done(-1)); }, timeout); timer.unref(); });
  let code; try { code = await Promise.race([completions.get(child), deadline]); } finally { clearTimeout(timer); }
  if (stopping) forced = await stopping;
  // Only known test receipts are retained for runtime suites. Error details from
  // HTTP tooling can include headers; these must never enter evidence files.
  const runtime = ['HTTP_MONGODB', 'OPS_MONGODB', 'BROWSER'].includes(layer);
  const receipts = stdout.split(/\r?\n/).flatMap(line => { try { const row = safeReceipt(JSON.parse(line)); return row ? [row] : []; } catch { return []; } });
  const safeOutput = runtime ? receipts.map(row => JSON.stringify(row)).join('\n') : `${stdout}${stderr}`;
  await writeFile(resolve(output, `${name}.log`), safeOutput);
  const record = { name, layer, command: [process.execPath, ...args], ...npmSource, exitCode: code, timedOut, forcedTermination: forced, durationMs: Date.now() - started, status: code === 0 && !timedOut ? 'PASSED' : 'FAILED', receipts };
  results.push(record); process.stdout.write(`${JSON.stringify({ suite: 'beta-check', name, status: record.status, durationMs: record.durationMs })}\n`); return record.status === 'PASSED';
}
const packageScripts = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).scripts;
const npm = (name, script, layer = 'STATIC') => {
  const npmEntryFile = /(?:^|\s)(?:\.\/)?(scripts\/[a-zA-Z0-9._/-]+\.(?:ts|mjs))(?:\s|$)/.exec(packageScripts[script] ?? '')?.[1];
  return run(name, layer, [npmCli, 'run', script], 300000, { npmScript: script, ...(npmEntryFile ? { npmEntryFile } : {}) });
};
let browserHarness;
try {
  await npm('types', 'check:types'); await npm('lint', 'check:lint'); await npm('agents', 'check:agents:changed');
  for (const script of ['assessment-reference', 'assessment-content', 'assessment-boundaries', 'assessment-ui', 'assessment-profile-ui', 'assessment-privacy-ui', 'local-acceptance', 'security-critical', 'notifications', 'notifications-pagination', 'client-errors', 'client-request-race', 'matching-disclosure', 'matching-social']) await npm(script, `selfcheck:${script}`, 'PURE_OR_COMPONENT');
  for (const script of ['beta-content.selfcheck.ts', 'beta-content-profile-ui.selfcheck.ts', 'beta-comparison.selfcheck.ts', 'beta-session.selfcheck.ts']) await run(script.replace('.selfcheck.ts', ''), 'PURE_OR_COMPONENT', ['--import', 'tsx', `scripts/${script}`]);
  for (const script of ['beta-check.integrity.selfcheck.mjs', 'beta-delivery.selfcheck.mjs']) await run(script.replace('.selfcheck.mjs', ''), 'PURE_OR_COMPONENT', [`scripts/${script}`]);
  const built = await npm('build', 'check:build', 'PRODUCTION_BUILD');
  if (scope === 'full') {
    await run('http-mongodb', 'HTTP_MONGODB', ['--import', 'tsx', 'scripts/local-acceptance.ts', '--suite=beta', `--mongod=${mongod}`, '--mongo-port=27079']);
    await run('operations', 'OPS_MONGODB', ['--import', 'tsx', 'scripts/beta-ops.integration.ts', `--mongod=${mongod}`]);
    await run('load', 'HTTP_MONGODB', ['--import', 'tsx', 'scripts/local-acceptance.ts', '--suite=beta-load', `--mongod=${mongod}`, '--mongo-port=27079']);
    if (built) {
      browserHarness = launch(process.execPath, ['--import', 'tsx', 'scripts/local-acceptance.ts', '--mode=browser', '--scenario=beta-history', `--mongod=${mongod}`, '--mongo-port=27079']);
      let log = ''; browserHarness.stdout.on('data', chunk => { log += chunk; }); browserHarness.stderr.resume();
      const started = Date.now(); while (!log.includes('"browser-ready"') && Date.now() - started < 90000 && browserHarness.exitCode === null) await new Promise(done => setTimeout(done, 100));
      assert.ok(log.includes('"browser-ready"'), 'Owned browser harness did not become ready');
      await run('browser', 'BROWSER', ['scripts/beta-browser.mjs', `--module=${browserModule}`, `--output=${output}`, `--run-id=${runId}`, `--source-identity=${before.sourceIdentity}`]);
      const forced = await stopOwned(browserHarness);
      results.push({ name: 'browser-cleanup', layer: 'HARNESS', status: browserHarness.exitCode === 0 && !forced ? 'PASSED' : 'FAILED', exitCode: browserHarness.exitCode }); browserHarness = null;
      browserHarness = launch(process.execPath, ['--import', 'tsx', 'scripts/local-acceptance.ts', '--mode=browser', '--scenario=beta-feed', `--mongod=${mongod}`, '--mongo-port=27079']);
      let feedLog = ''; browserHarness.stdout.on('data', chunk => { feedLog += chunk; }); browserHarness.stderr.resume();
      const feedStarted = Date.now(); while (!feedLog.includes('"browser-ready"') && Date.now() - feedStarted < 90000 && browserHarness.exitCode === null) await new Promise(done => setTimeout(done, 100));
      assert.ok(feedLog.includes('"browser-ready"'), 'Owned feed browser harness did not become ready');
      await run('browser-feed', 'BROWSER', ['scripts/beta-feed-browser.mjs', `--module=${browserModule}`, `--output=${output}`, `--run-id=${runId}`, `--source-identity=${before.sourceIdentity}`]);
      const feedForced = await stopOwned(browserHarness);
      results.push({ name: 'browser-feed-cleanup', layer: 'HARNESS', status: browserHarness.exitCode === 0 && !feedForced ? 'PASSED' : 'FAILED', exitCode: browserHarness.exitCode }); browserHarness = null;
    }
  } else results.push({ name: 'http-db-ops-load-browser', status: 'NOT_RUN', layer: 'RUNTIME', reason: 'Explicit --scope=code cannot certify implementation readiness' });
} catch (error) {
  results.push({ name: 'runner', status: 'FAILED', layer: 'HARNESS', errorClass: error instanceof Error ? error.name : 'ExecutionError' });
} finally {
  if (browserHarness?.exitCode === null) await stopOwned(browserHarness);
}
const after = await identity(); await writeFile(resolve(output, 'tested-manifest.after.json'), JSON.stringify(after, null, 2));
const unchanged = before.sourceIdentity === after.sourceIdentity && before.head === after.head && before.branch === after.branch;
results.push({ name: 'unchanged-tested-tree', layer: 'IDENTITY', status: unchanged ? 'PASSED' : 'FAILED' });
// Alternate indexes preserve the user's index. Replay is applied and compared to every normalized source blob.
let patchResult = { verified: false };
try { patchResult = await createVerifiedPatch(root, before.head, after.files, output); results.push({ name: 'complete-patch-applied-and-blobs-verified', layer: 'IDENTITY', status: 'PASSED', files: patchResult.verifiedFiles }); }
catch (error) { results.push({ name: 'complete-patch-applied-and-blobs-verified', layer: 'IDENTITY', status: 'FAILED', errorClass: error instanceof Error ? error.name : 'PatchVerificationError' }); }
const requirements = JSON.parse(await readFile(resolve(root, 'docs/assessment/BETA_ACCEPTANCE.requirements.json'), 'utf8'));
const original = JSON.parse(await readFile(resolve(root, 'docs/assessment/ACCEPTANCE.json'), 'utf8'));
const maps = [];
for (const file of ['BETA_SOURCES_COVERAGE.json', 'BETA_COMPARISON_COVERAGE.json', 'BETA_OPERATIONS_COVERAGE.json', 'BETA_CLIENT_COVERAGE.json']) {
  try { maps.push(JSON.parse(await readFile(resolve(root, 'docs/assessment', file), 'utf8'))); } catch { maps.push({ cases: [] }); }
}
const mappings = maps.flatMap(map => map.cases ?? []);
const browserEvidence = [];
for (const [name, file, script, suite] of [['browser', 'browser-results.json', 'scripts/beta-browser.mjs', 'beta-browser'], ['browser-feed', 'browser-feed-results.json', 'scripts/beta-feed-browser.mjs', 'beta-feed-browser']]) {
  const result = results.find(row => row.name === name && row.status === 'PASSED'); if (!result) continue;
  const artifact = await readFile(resolve(output, file), 'utf8').then(JSON.parse).catch(() => null);
  const valid = artifact && Array.isArray(artifact.records) && artifact.runId === runId && artifact.sourceIdentity === before.sourceIdentity;
  results.push({ name: `${name}-artifact-identity`, layer: 'IDENTITY', status: valid ? 'PASSED' : 'FAILED' });
  if (!valid) continue;
  browserEvidence.push({ file, script, ...artifact });
  // The artifact inherits provenance only from its exact successful browser command and current invocation identity.
  result.receipts.push(...artifact.records.filter(row => row && typeof row === 'object').map(row => ({ ...row, suite, sourceFile: script })));
}
const execution = results.flatMap(result => result.status === 'PASSED' ? result.receipts ?? [] : []);
// Only locally constructed result records can attest structural checks; stdout receipts cannot set this provenance.
for (const result of results) result.producer = 'scripts/beta-check.mjs';
const assertions = successfulAssertions(results);
const cases = requirements.cases.map(requirement => {
  const mapped = mappings.filter(row => row.id === requirement.id);
  const tests = mapped.flatMap(row => row.tests ?? []);
  const observed = tests.filter(test => matchesAssertion(test, assertions));
  const externalPrerequisites = mapped.flatMap(row => [...(row.externalPrerequisites ?? []), ...(row.unverifiedSubparts ?? []).filter(part => part.status === 'BLOCKED_EXTERNAL')]);
  const unverified = mapped.flatMap(row => (row.unverifiedSubparts ?? []).filter(part => part.status !== 'BLOCKED_EXTERNAL'));
  const implementationStatus = observed.length === tests.length && tests.length > 0 && unverified.length === 0 && unchanged ? 'PASSED' : observed.length ? 'PARTIAL' : tests.length === 0 && unverified.length === 0 && externalPrerequisites.length > 0 ? 'NOT_APPLICABLE_EXTERNAL' : 'NOT_RUN';
  const status = implementationStatus === 'NOT_APPLICABLE_EXTERNAL' ? 'BLOCKED_EXTERNAL' : implementationStatus === 'PASSED' && externalPrerequisites.length ? 'PARTIAL' : implementationStatus;
  return { ...requirement, status, implementationStatus, environmentStatus: externalPrerequisites.length ? 'BLOCKED_EXTERNAL' : 'NO_EXTERNAL_PREREQUISITE_MAPPED', priorStatus: requirement.status, runId, sourceIdentity: before.sourceIdentity, tests, observed, unverifiedSubparts: unverified, externalPrerequisites, evidenceLimitations: mapped.flatMap(row => row.evidenceLimitations ?? []) };
});
const originalMap = await readFile(resolve(root, 'docs/assessment/INT_REEXECUTION_COVERAGE.json'), 'utf8').then(JSON.parse).catch(() => ({ cases: [] }));
const originalCases = original.cases.map(requirement => {
  const mapped = (originalMap.cases ?? []).filter(row => row.id === requirement.id);
  const direct = assertions.filter(row => row.assertion === requirement.id && ['assessment', 'assessment-comparison', 'assessment-content'].includes(row.suite)).map(row => ({ file: row.file, suite: row.suite, assertion: requirement.id, layer: 'FRESH_RETAINED_ASSERTION' }));
  const tests = [...mapped.flatMap(row => row.tests ?? []), ...direct];
  const observed = tests.filter(test => matchesAssertion(test, assertions));
  const unverified = mapped.flatMap(row => row.unverifiedSubparts ?? []);
  if (requirement.id === 'INT-024' && !unverified.some(row => row.layer === 'NATIVE_A11Y')) unverified.push({ status: 'NOT_RUN', layer: 'NATIVE_A11Y', description: 'Actual native screen reader workflow is not established by component or browser DOM assertions.' });
  const status = observed.length === tests.length && tests.length > 0 && unverified.length === 0 && unchanged ? 'PASSED' : observed.length ? 'PARTIAL' : 'NOT_RUN';
  return { ...separatePriorAcceptanceEvidence(requirement), status, runId, sourceIdentity: before.sourceIdentity, tests, observed, unverifiedSubparts: unverified };
});
const external = [
  { id: 'BETA-115', status: 'NOT_RUN', reason: 'Actual native screen reader task/error/review workflow was not executed; DOM is not substituted' },
  { id: 'BETA-116', status: 'BLOCKED_EXTERNAL', reason: 'No authorized real Discord OAuth/iframe target or scope-specific platform approval was provided' },
  { id: 'BETA-126', status: 'BLOCKED_EXTERNAL', reason: 'No real target approvals, operator permission, adopted retention/recovery and rollout evidence; opening not authorized' },
];
const readiness = computeReadiness({ results, betaCases: cases, originalCases });
const releaseGates = evaluateBetaReleaseGates({ requirements: JSON.parse(await readFile(resolve(root, 'docs/assessment/BETA_RELEASE_GATES.requirements.json'), 'utf8')), results, betaCases: cases, originalCases, readiness, runId, sourceIdentity: before.sourceIdentity });
const { automaticPassed, implementationReady } = readiness;
const counts = cases.reduce((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {});
const report = { schemaVersion: 'beta-execution-v1', runId, recordedAt: new Date().toISOString(), scope, sourceIdentity: before.sourceIdentity, head: before.head,
  environment: versions, originalReportedAcceptance: original,
  originalReexecution: { count: originalCases.length, counts: originalCases.reduce((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {}), cases: originalCases },
  originalReexecutionReceipts: execution.filter(row => row.suite === 'assessment' || row.suite === 'assessment-comparison'),
  results, beta: { count: cases.length, counts, cases }, external, readiness, releaseGates,
  patch: patchResult, browserEvidence,
};
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
process.stdout.write(`${JSON.stringify({ suite: 'beta-check', runId, sourceIdentity: before.sourceIdentity, automaticPassed, implementationReady, environmentReady: false, privateBetaOpen: false, counts, output })}\n`);
process.exitCode = scope === 'full' ? implementationReady ? 0 : 1 : results.filter(result => result.status !== 'NOT_RUN').every(result => result.status === 'PASSED') ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => {
  process.stderr.write(`${JSON.stringify({ suite: 'beta-check', status: 'FAILED', errorClass: error instanceof Error ? error.name : 'RunnerError' })}\n`); process.exitCode = 1;
});
