import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { createServer as createHttpServer, request as httpRequest, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  assertOwnedLocalAcceptanceDirectory, localAcceptanceActor, localAcceptanceHostname,
  localAcceptanceEnvironment, parseLocalAcceptanceOptions,
} from './lib/local-acceptance-options';

type OwnedProcess = { child: ChildProcess; closed: Promise<void>; label: string; readonly finished: boolean };
const workspace = fileURLToPath(new URL('../', import.meta.url));
const children: OwnedProcess[] = [];
const stop = new AbortController();
let stage = 'arguments';
let temporaryDirectory: string | undefined;
let temporaryParent: string | undefined;
let databaseClient: mongoose.mongo.MongoClient | undefined;
let bootstrap: HttpServer | undefined;
let fixtureCleanup: (() => Promise<void>) | undefined;
let failed = false;
const requestStop = () => stop.abort();
process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);
process.stdin.resume();
process.stdin.once('data', requestStop);

const report = (status: string, fields: Record<string, string | number | boolean> = {}) => {
  process.stdout.write(`${JSON.stringify({ suite: 'local-acceptance', status, ...fields })}\n`);
};

const exists = async (path: string) => {
  try { await access(path); return true; } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
};

const assertFreePort = async (port: number): Promise<void> => {
  const server = createNetServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', () => reject(new Error('LOCAL_ACCEPTANCE_PORT_OCCUPIED')));
    server.listen(port, '127.0.0.1', () => server.close((error) => error ? reject(error) : resolveListen()));
  });
};

const start = (label: string, command: string, args: string[], environment: NodeJS.ProcessEnv): OwnedProcess => {
  stop.signal.throwIfAborted();
  const child = spawn(command, args, { cwd: workspace, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: environment });
  let finished = false;
  const closed = new Promise<void>((resolveClosed) => {
    const finish = () => { finished = true; resolveClosed(); };
    child.once('error', finish);
    child.once('close', finish);
  });
  // Child diagnostics may include synthetic answers/ids. Keep output aggregate.
  child.stdout?.resume();
  child.stderr?.resume();
  if (label.startsWith('next')) {
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString('utf8').includes('LOCAL_ACCEPTANCE_NEXT_READY:')) report('next-listening', { server: label });
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const code = /\b(EADDRINUSE|MODULE_NOT_FOUND|ENOENT|EACCES|ENOMEM|LOCAL_ACCEPTANCE_[A-Z_]+)\b/.exec(chunk.toString('utf8'))?.[1];
      if (code) report('next-diagnostic', { code });
    });
  }
  const owned = { child, closed, label, get finished() { return finished; } };
  children.push(owned);
  return owned;
};

const waitUntil = async (probe: () => Promise<boolean>, owned: OwnedProcess, timeoutMs = 45_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    stop.signal.throwIfAborted();
    if (owned.finished) throw new Error('LOCAL_ACCEPTANCE_CHILD_EXITED');
    if (await probe()) return;
    await delay(250, undefined, { signal: stop.signal });
  }
  throw new Error('LOCAL_ACCEPTANCE_START_TIMEOUT');
};

const stopOwnedProcess = async (owned: OwnedProcess): Promise<void> => {
  if (owned.finished) return;
  if (!owned.child.pid) throw new Error('LOCAL_ACCEPTANCE_CHILD_PID_MISSING');
  if (owned.label === 'mongodb') {
    // MongoDB has no suite descendants. Use the retained child process handle;
    // never send shutdown through a reconnecting database client or a reused URI.
    owned.child.kill('SIGTERM');
  } else if (process.platform === 'win32') {
    // The aggregate has a current suite child; killing only its parent would
    // orphan that suite. Target exactly the process tree we spawned ourselves.
    const killer = spawn(resolve(process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(owned.child.pid), '/T', '/F'], {
      shell: false, windowsHide: true, stdio: 'ignore', env: process.env,
    });
    await Promise.race([
      new Promise<void>((resolveKill) => { killer.once('error', () => resolveKill()); killer.once('close', () => resolveKill()); }),
      delay(5_000, undefined, { ref: false }),
    ]);
  } else {
    // Every child has its own process group, so descendants share this boundary.
    try { process.kill(-owned.child.pid, 'SIGTERM'); } catch { /* It may have exited between checks. */ }
  }
  await Promise.race([owned.closed, delay(5_000, undefined, { ref: false })]);
  if (!owned.finished) throw new Error('LOCAL_ACCEPTANCE_CHILD_STOP_TIMEOUT');
};

const waitForChild = async (owned: OwnedProcess) => {
  await Promise.race([
    owned.closed,
    delay(300_000, undefined, { ref: false }).then(() => { throw new Error('LOCAL_ACCEPTANCE_INTEGRATION_TIMEOUT'); }),
    new Promise<void>((resolveStop) => stop.signal.addEventListener('abort', () => resolveStop(), { once: true })),
  ]);
  stop.signal.throwIfAborted();
  if (owned.child.exitCode !== 0) throw new Error('LOCAL_ACCEPTANCE_INTEGRATION_FAILED');
};

async function main(): Promise<void> {
  const options = parseLocalAcceptanceOptions(process.argv.slice(2), process.env);
  if (!(await stat(options.mongod)).isFile()) throw new Error('LOCAL_ACCEPTANCE_MONGOD_NOT_FILE');
  stage = 'environment-guard';
  // Next automatically loads these files. Refuse their presence, never read or
  // rename them, so a local check cannot consume the owner's runtime credentials.
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    if (await exists(join(workspace, file))) throw new Error('LOCAL_ACCEPTANCE_ENV_FILE_PRESENT');
  }
  if (options.mode === 'browser' && !(await exists(join(workspace, '.next', 'BUILD_ID')))) {
    throw new Error('LOCAL_ACCEPTANCE_PRODUCTION_BUILD_REQUIRED');
  }
  stage = 'port-guard';
  for (const port of options.mode === 'browser' ? [options.mongoPort, options.appPort, options.partnerAppPort, options.loginPort] : [options.mongoPort]) {
    await assertFreePort(port);
  }
  const runId = randomBytes(6).toString('hex');
  const replicaSet = `vmesteLocal${runId}`;
  const uri = `mongodb://127.0.0.1:${options.mongoPort}/vmeste_local_${runId}_test?replicaSet=${replicaSet}&directConnection=true`;
  const environment: NodeJS.ProcessEnv = {
    ...localAcceptanceEnvironment(process.env), NODE_ENV: 'production',
    MONGODB_URI: uri, MATCHING_TEST_MONGODB_URI: uri, JWT_SECRET: randomBytes(48).toString('hex'),
    NEXT_PUBLIC_DISCORD_CLIENT_ID: '100000000000000001', DISCORD_CLIENT_SECRET: randomBytes(32).toString('hex'),
    DISCORD_REDIRECT_URI: `http://127.0.0.1:${options.appPort}/`, NEXT_PUBLIC_DISCORD_REDIRECT_URI: `http://127.0.0.1:${options.appPort}/`,
    BILLING_MODE: 'disabled', TRUSTED_PROXY_MODE: 'disabled', NEXT_TELEMETRY_DISABLED: '1',
  };
  // The fixture services run in this process; they see exactly the same isolated
  // environment as Next and the suite children, never inherited application env.
  process.env = environment;
  temporaryParent = await realpath(tmpdir());
  temporaryDirectory = await mkdtemp(join(temporaryParent, 'vmeste-local-acceptance-'));
  assertOwnedLocalAcceptanceDirectory(temporaryDirectory, temporaryParent);
  const dbPath = join(temporaryDirectory, 'data');
  await mkdir(dbPath);
  stage = 'mongodb-start';
  const mongo = start('mongodb', options.mongod, ['--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', String(options.mongoPort), '--replSet', replicaSet, '--logpath', join(temporaryDirectory, 'mongod.log'), '--quiet'], environment);
  const directUri = `mongodb://127.0.0.1:${options.mongoPort}/admin?directConnection=true`;
  databaseClient = new mongoose.mongo.MongoClient(directUri, { serverSelectionTimeoutMS: 750 });
  await waitUntil(async () => {
    try { await databaseClient!.connect(); return true; } catch { return false; }
  }, mongo);
  const mongoOptions = z.object({ parsed: z.object({
    storage: z.object({ dbPath: z.string() }),
    replication: z.object({ replSet: z.string().optional(), replSetName: z.string().optional() }),
    net: z.object({ port: z.number() }),
  }) }).parse(await databaseClient.db('admin').command({ getCmdLineOpts: 1 }));
  if (resolve(mongoOptions.parsed.storage?.dbPath ?? '') !== resolve(dbPath)
    || (mongoOptions.parsed.replication?.replSetName ?? mongoOptions.parsed.replication?.replSet) !== replicaSet
    || mongoOptions.parsed.net?.port !== options.mongoPort) {
    // A process that wins a port race is never initialization/shutdown authority.
    await databaseClient.close();
    databaseClient = undefined;
    throw new Error('LOCAL_ACCEPTANCE_MONGODB_OWNERSHIP_MISMATCH');
  }
  await databaseClient.db('admin').command({ replSetInitiate: { _id: replicaSet, members: [{ _id: 0, host: `127.0.0.1:${options.mongoPort}` }] } });
  await waitUntil(async () => {
    try { return (await databaseClient!.db('admin').command({ hello: 1 })).isWritablePrimary === true; } catch { return false; }
  }, mongo);
  report('database-ready', { mode: options.mode, mongoPort: options.mongoPort });
  if (options.mode === 'integration') {
    stage = options.suite === 'factors' ? 'factor-integration-suites' : 'six-integration-suites';
    const integration = start('integration', process.execPath, ['--import', 'tsx', resolve(workspace, 'scripts/two-user-acceptance.integration.ts'), ...(options.suite === 'factors' ? ['--factors'] : [])], environment);
    let buffered = '';
    integration.child.stdout?.on('data', (chunk: Buffer) => {
      if (stop.signal.aborted) return;
      buffered += chunk.toString('utf8');
      if (buffered.length > 8_192) { buffered = ''; return; }
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        // Only forward fields from the existing aggregate's compact status rows.
        const suite = /"suite":"([a-z-]+)"/.exec(line)?.[1];
        const status = /"status":"(running|passed|failed)"/.exec(line)?.[1];
        const testStage = /"stage":"([A-Za-z0-9 ]{1,80})"/.exec(line)?.[1];
        if (suite && status) report(status, { check: suite, ...(testStage ? { stage: testStage } : {}) });
      }
    });
    await waitForChild(integration);
    report('passed', { checks: options.suite === 'factors' ? 3 : 6,
      discordIframeValidated: false, realOAuthValidated: false });
    return;
  }
  stage = 'browser-fixtures';
  const { createLocalAcceptanceFixtures } = await import('./lib/local-acceptance-fixtures');
  const fixtures = await (async () => {
    const info = console.info;
    // Domain analytics remain enabled, but their synthetic event rows are not
    // acceptance evidence and must not appear in this aggregate-only output.
    console.info = () => undefined;
    try { return await createLocalAcceptanceFixtures(runId, options.scenario); }
    finally { console.info = info; }
  })();
  fixtureCleanup = fixtures.cleanup;
  stage = 'next-start';
  const nextServers = (['a', 'b'] as const).map((actor) => ({
    actor, port: actor === 'a' ? options.appPort : options.partnerAppPort,
    owned: start(`next-${actor}`, process.execPath, ['--import', 'tsx', resolve(workspace, 'scripts/local-acceptance-server.ts'), actor, String(actor === 'a' ? options.appPort : options.partnerAppPort), options.hostPrefix], environment),
  }));
  for (const server of nextServers) {
  let lastHealthObservation = '';
  await waitUntil(async () => {
    try {
      const response = await new Promise<{ ok: boolean; status: number }>((resolveResponse, reject) => {
        // The TCP destination and HTTP authority intentionally differ. The
        // native client preserves the exact Host; fetch may normalize it.
        const request = httpRequest({
          hostname: '127.0.0.1', port: server.port, path: '/api/health/live', method: 'GET',
          headers: { Host: `${localAcceptanceHostname(server.actor, options.hostPrefix)}:${server.port}` },
          agent: false, signal: AbortSignal.timeout(2_000),
        }, (result) => {
          result.once('error', reject);
          result.once('end', () => {
            const status = result.statusCode ?? 0;
            resolveResponse({ ok: status >= 200 && status < 300, status });
          });
          result.resume();
        });
        request.once('error', reject);
        request.end();
      });
      if (!response.ok && lastHealthObservation !== String(response.status)) {
        lastHealthObservation = String(response.status);
        report('next-health-wait', { server: server.owned.label, httpStatus: response.status });
      }
      return response.ok;
    } catch (error) {
      const reason = error instanceof Error && /^[A-Za-z]+Error$/.test(error.name) ? error.name : 'ConnectionError';
      if (lastHealthObservation !== reason) { lastHealthObservation = reason; report('next-health-wait', { server: server.owned.label, reason }); }
      return false;
    }
  }, server.owned, 90_000);
  }
  stage = 'browser-bootstrap';
  bootstrap = createHttpServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const host = request.headers.host;
    const validHost = [`127.0.0.1:${options.loginPort}`, `localhost:${options.loginPort}`, `${localAcceptanceHostname('a', options.hostPrefix)}:${options.loginPort}`, `${localAcceptanceHostname('b', options.hostPrefix)}:${options.loginPort}`].includes(host ?? '');
    const origin = request.headers.origin;
    const validOrigin = !origin || origin === `http://${host}`;
    if (!validHost || !validOrigin || request.headers['sec-fetch-site'] === 'cross-site') {
      response.writeHead(403).end(); return;
    }
    if (request.method === 'GET' && request.url === '/status') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ ready: true, participants: 2, fixture: options.scenario, realOAuthValidated: false })); return;
    }
    if (request.method === 'POST' && request.url === '/stop' && origin === `http://${host}`) {
      response.writeHead(202).end(); requestStop(); return;
    }
    const actor = localAcceptanceActor(host, request.url, options.loginPort, options.hostPrefix);
    if (request.method !== 'GET' || !actor) { response.writeHead(404).end(); return; }
    response.setHeader('Set-Cookie', fixtures.sessionCookie(actor));
    response.writeHead(303, { Location: `http://${localAcceptanceHostname(actor, options.hostPrefix)}:${actor === 'a' ? options.appPort : options.partnerAppPort}/${options.scenario === 'first-entry' ? 'entry' : options.scenario === 'onboarding' ? 'mvp-onboarding' : 'main-menu'}` }).end();
  });
  await new Promise<void>((resolveListen, reject) => {
    bootstrap!.once('error', reject);
    bootstrap!.listen(options.loginPort, '127.0.0.1', resolveListen);
  });
  stage = 'browser-running';
  report('browser-ready', {
    participantA: `http://${localAcceptanceHostname('a', options.hostPrefix)}:${options.loginPort}/a`, participantB: `http://${localAcceptanceHostname('b', options.hostPrefix)}:${options.loginPort}/b`,
    statusUrl: `http://127.0.0.1:${options.loginPort}/status`, appPort: options.appPort, partnerAppPort: options.partnerAppPort, loginPort: options.loginPort,
  });
  await Promise.race([
    new Promise<void>((resolveStop) => stop.signal.addEventListener('abort', () => resolveStop(), { once: true })),
    ...nextServers.map((server) => server.owned.closed.then(() => { throw new Error('LOCAL_ACCEPTANCE_NEXT_EXITED'); })),
    mongo.closed.then(() => { throw new Error('LOCAL_ACCEPTANCE_MONGODB_EXITED'); }),
  ]);
}

async function cleanup(): Promise<void> {
  if (bootstrap) await new Promise<void>((resolveClose) => {
    bootstrap!.close(() => resolveClose());
    // Browser keep-alive/speculative sockets must not keep our disposable
    // bootstrap open and prevent owned Next/Mongo processes from being stopped.
    bootstrap!.closeAllConnections();
  });
  for (const owned of children.filter((child) => child.label !== 'mongodb').reverse()) {
    await stopOwnedProcess(owned).catch(() => { failed = true; });
  }
  if (fixtureCleanup) await fixtureCleanup().catch(() => { failed = true; });
  else await mongoose.disconnect().catch(() => { failed = true; });
  if (databaseClient) {
    await databaseClient.close().catch(() => undefined);
  }
  const mongo = children.find((child) => child.label === 'mongodb');
  if (mongo) {
    await stopOwnedProcess(mongo).catch(() => { failed = true; });
  }
  if (temporaryDirectory && temporaryParent) {
    if (children.some((child) => !child.finished)) throw new Error('LOCAL_ACCEPTANCE_LIVE_CHILD_PREVENTS_CLEANUP');
    assertOwnedLocalAcceptanceDirectory(temporaryDirectory, temporaryParent);
    // No shared database or old directory is ever removed: mkdtemp returned this
    // exact directory during this invocation, and all its processes have exited.
    await rm(temporaryDirectory, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 });
  }
  process.stdin.pause();
}

void main().catch((error: Error) => {
  if (stop.signal.aborted) { report('interrupted', { stage }); return; }
  failed = true;
  report('failed', { stage, reason: /^LOCAL_ACCEPTANCE_[A-Z_]+$/.test(error.message) ? error.message : 'LOCAL_ACCEPTANCE_STAGE_FAILED' });
}).finally(async () => {
  try { await cleanup(); } catch { failed = true; report('cleanup-failed', { stage }); }
  report(failed ? 'failed' : 'cleaned-up', { realOAuthValidated: false, discordIframeValidated: false });
  process.exitCode = failed ? 1 : 0;
});
