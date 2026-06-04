import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const script = readFileSync(
  join(process.cwd(), 'scripts/backfill-vector-snapshots.ts'),
  'utf8'
);

assert.ok(script.includes("'reason.source': 'migration'"));
assert.ok(script.includes("reason: { source: 'migration' }"));
assert.ok(script.includes('VectorSnapshot.exists'));
assert.ok(script.includes('VectorSnapshot.create'));
assert.ok(script.includes('before: current'));
assert.ok(script.includes('after: current'));
assert.ok(!script.includes('User.update'));
assert.ok(!script.includes('save()'));

console.log('backfill-vector-snapshots.selfcheck passed');
