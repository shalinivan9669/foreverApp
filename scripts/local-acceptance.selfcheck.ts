import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertOwnedLocalAcceptanceDirectory, localAcceptanceActor, localAcceptanceHostname,
  localAcceptanceEnvironment, parseLocalAcceptanceOptions, parseLocalAcceptanceHostPrefix,
} from './lib/local-acceptance-options';

const binary = resolve('test-mongod');
assert.equal(parseLocalAcceptanceOptions(['--mongod', binary, '--suite=factors'], {}).suite, 'factors');
assert.throws(() => parseLocalAcceptanceOptions(['--mongod', binary, '--suite=arbitrary'], {}));
assert.throws(() => parseLocalAcceptanceOptions(['--mongod', binary, '--mode=browser', '--suite=factors'], {}));
assert.equal(parseLocalAcceptanceOptions(['--mongod', binary], {}).mode, 'integration');
assert.equal(parseLocalAcceptanceOptions(['--mode=browser'], { LOCAL_ACCEPTANCE_MONGOD: binary }).appPort, 3106);
assert.equal(parseLocalAcceptanceOptions(['--mongod', binary], {}).partnerAppPort, 3108);
assert.equal(parseLocalAcceptanceOptions(['--mongod', binary], {}).scenario, 'existing-partner');
assert.equal(parseLocalAcceptanceOptions(['--mongod', binary], {}).hostPrefix, 'vmeste');
for (const prefix of ['vmeste', 'vmeste-workspace', 'vmeste-matching'] as const) {
  assert.equal(parseLocalAcceptanceOptions(['--mongod', binary, '--mode=browser', '--host-prefix', prefix], {}).hostPrefix, prefix);
  for (const actor of ['a', 'b'] as const) {
    const hostname = localAcceptanceHostname(actor, prefix);
    assert.equal(hostname, `${prefix}-${actor}.localhost`);
    assert.equal(localAcceptanceActor(`${hostname}:3117`, `/${actor}`, 3117, prefix), actor);
    assert.equal(localAcceptanceActor(`${hostname}:3117`, actor === 'a' ? '/b' : '/a', 3117, prefix), null);
    assert.equal(localAcceptanceActor(`${hostname}:3117`, `/${actor}?userId=someone`, 3117, prefix), null);
    assert.equal(localAcceptanceActor(`${hostname}:3117`, `/${actor}`, 3118, prefix), null);
    assert.equal(localAcceptanceActor(`${hostname}.evil.test:3117`, `/${actor}`, 3117, prefix), null);
  }
}
assert.equal(localAcceptanceActor('vmeste-a.localhost:3117', '/a', 3117, 'vmeste-workspace'), null);
assert.equal(localAcceptanceActor('vmeste-workspace-a.localhost:3117', '/a', 3117, 'vmeste-matching'), null);
for (const invalid of ['', 'evil.test', 'localhost', '127.0.0.1', 'vmeste-workspace.evil.test', 'vmeste-workspace/a', 'vmeste-workspace\n']) {
  assert.throws(() => parseLocalAcceptanceHostPrefix(invalid));
  assert.throws(() => parseLocalAcceptanceOptions(['--mongod', binary, '--mode=browser', '--host-prefix', invalid], {}));
}
assert.throws(() => parseLocalAcceptanceOptions(['--mongod', binary, '--host-prefix=vmeste-workspace'], {}));
for (const scenario of ['existing-partner', 'solo', 'onboarding', 'first-entry', 'matching', 'matching-connection', 'notifications']) assert.equal(parseLocalAcceptanceOptions(['--mongod', binary, '--mode=browser', '--scenario', scenario], {}).scenario, scenario);
assert.throws(() => parseLocalAcceptanceOptions(['--mongod', binary, '--scenario=solo'], {}));
assert.throws(() => parseLocalAcceptanceOptions(['--mongod', binary, '--mode=browser', '--scenario=production'], {}));
assert.throws(() => parseLocalAcceptanceOptions(['--mongod', binary, '--partner-app-port', '3106'], {}));
for (const args of [[], ['--mongod', 'relative'], ['--mongod', binary, '--mode', 'production'], ['--mongod', binary, '--mongo-port', '3106'], ['--mongod', binary, '--login-port', '80'], ['--mongod', binary, '--actor', 'someone'], ['--mongod', binary, '--mongod', binary]]) {
  assert.throws(() => parseLocalAcceptanceOptions(args, {}));
}
assert.deepEqual(localAcceptanceEnvironment({ PATH: 'runtime', SystemRoot: 'os', JWT_SECRET: 'not-forwarded', MONGODB_URI: 'not-forwarded', NODE_OPTIONS: 'not-forwarded', HTTP_PROXY: 'not-forwarded' }), { PATH: 'runtime', SystemRoot: 'os' });
assertOwnedLocalAcceptanceDirectory(resolve(tmpdir(), 'vmeste-local-acceptance-Ab12'), tmpdir());
for (const path of [tmpdir(), resolve(tmpdir(), '..'), resolve(tmpdir(), 'other-data'), resolve(tmpdir(), 'vmeste-local-acceptance-Ab12', 'nested')]) {
  assert.throws(() => assertOwnedLocalAcceptanceDirectory(path, tmpdir()));
}
assert.equal(localAcceptanceActor('vmeste-a.localhost:3107', '/a', 3107), 'a');
assert.equal(localAcceptanceActor('vmeste-b.localhost:3107', '/b', 3107), 'b');
for (const [host, path] of [['evil.test:3107', '/a'], ['vmeste-a.localhost:3107', '/b'], ['vmeste-b.localhost:3107', '/a'], ['vmeste-a.localhost:3107', '/a?userId=someone'], ['vmeste-a.localhost:9999', '/a'], ['127.0.0.1:3107', '/a'], ['localhost:3107', '/b']]) {
  assert.equal(localAcceptanceActor(host, path, 3107), null);
}
process.stdout.write('local-acceptance selfcheck: passed (arguments, environment isolation, cleanup boundary, fixed subjects)\n');
