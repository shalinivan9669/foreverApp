import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { z } from 'zod';
import { localAcceptanceEnvironment } from './lib/local-acceptance-options';

async function freePort() {
  const server = createServer();
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  await new Promise<void>(done => server.close(() => done()));
  return address.port;
}

/** Owns the process, replica identity and temporary directory; never uses application env files or an existing Mongo target. */
async function main() {
  const mongod = process.argv.find(value => value.startsWith('--mongod='))?.slice(9);
  assert.ok(mongod && isAbsolute(mongod), 'REGISTERED_ABSOLUTE_MONGOD_PATH_REQUIRED');
  const cleanEnvironment: NodeJS.ProcessEnv = { ...localAcceptanceEnvironment(process.env), NODE_ENV: 'test' };
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, cleanEnvironment);
  const port = await freePort(), id = randomBytes(6).toString('hex'), replica = `vmesteRegistered${id}`;
  const parent = await realpath(tmpdir());
  const directory = await mkdtemp(join(parent, 'vmeste-registered-'));
  const data = join(directory, 'data'); await mkdir(data);
  let mongo: ChildProcess | undefined, client: mongoose.mongo.MongoClient | undefined;
  let ownedIdentityVerified = false;
  try {
    const launched = spawn(resolve(mongod), ['--dbpath', data, '--bind_ip', '127.0.0.1', '--port', String(port), '--replSet', replica, '--logpath', join(directory, 'mongod.log'), '--quiet'], { windowsHide: true, stdio: 'ignore', env: cleanEnvironment });
    mongo = launched;
    let launchFailed = false; launched.once('error', () => { launchFailed = true; });
    client = new mongoose.mongo.MongoClient(`mongodb://127.0.0.1:${port}/admin?directConnection=true`, { serverSelectionTimeoutMS: 250 });
    let connected = false;
    for (let attempt = 0; attempt < 100 && !launchFailed; attempt++) {
      try { await client.connect(); connected = true; break; } catch { await delay(100); }
    }
    assert.ok(connected && !launchFailed, 'REGISTERED_OWNED_MONGO_START_REQUIRED');
    const options = z.object({ parsed: z.object({ storage: z.object({ dbPath: z.string() }), replication: z.object({ replSet: z.string().optional(), replSetName: z.string().optional() }) }) }).parse(await client.db('admin').command({ getCmdLineOpts: 1 }));
    assert.equal(resolve(options.parsed.storage.dbPath), resolve(data), 'REGISTERED_OWNED_DBPATH_MISMATCH');
    assert.equal(options.parsed.replication.replSetName ?? options.parsed.replication.replSet, replica, 'REGISTERED_OWNED_REPLICA_MISMATCH');
    ownedIdentityVerified = true;
    await client.db('admin').command({ replSetInitiate: { _id: replica, members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    let primary = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if ((await client.db('admin').command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
      await delay(100);
    }
    assert.ok(primary, 'REGISTERED_OWNED_PRIMARY_REQUIRED');
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${port}/vmeste_registered_${id}_test?replicaSet=${replica}`;
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    // No mode, beta approval, invitation, recovery URI or synthetic-auth flag is supplied.
    const { checkRegisteredAssessmentHttp } = await import('./lib/assessment-registered-http');
    await checkRegisteredAssessmentHttp(id);
  } finally {
    await mongoose.disconnect();
    if (client) {
      if (ownedIdentityVerified) { try { await client.db('admin').command({ shutdown: 1 }); } catch { /* The owned mongod closes this connection during shutdown. */ } }
      await client.close();
    }
    if (mongo && mongo.exitCode === null) {
      await Promise.race([new Promise<void>(done => mongo!.once('exit', () => done())), delay(5000)]);
      if (mongo.exitCode === null) mongo.kill();
    }
    const actual = await realpath(directory);
    assert.ok(actual.startsWith(`${parent}${sep}`) && actual === resolve(directory) && actual.includes(`${sep}vmeste-registered-`), 'REGISTERED_UNSAFE_CLEANUP_PATH');
    await rm(actual, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
main().catch(error => {
  // Assertion descriptions contain no answers, cookies, secrets or account payloads.
  const reason = error instanceof Error && /^REGISTERED_[A-Z_]+$/.test(error.message) ? error.message : 'REGISTERED_SUITE_FAILED';
  process.stderr.write(`${JSON.stringify({ suite: 'assessment-registered', status: 'FAIL', reason })}\n`);
  process.exitCode = 1;
});
