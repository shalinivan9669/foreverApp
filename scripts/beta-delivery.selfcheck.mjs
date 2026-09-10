/** Immutable handoff/reference checks and retained semantic boundary execution. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(resolve(root, file), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex');
const receipt = assertion => process.stdout.write(`${JSON.stringify({ suite: 'beta-delivery', assertion, status: 'PASSED', layer: 'IMMUTABLE_CONTRACT_AND_RETAINED_SEMANTICS' })}\n`);
const pinned = [
  ['docs/assessment/ACCEPTANCE.json', 'cc233f584673dc4b969f977a22f5a10ced9a0d09f77f62dcedd282a2579757bb'],
  ['docs/assessment/BETA_ACCEPTANCE.requirements.json', 'df50222e0ea8c3c02a9cbcd1af399a2a864f37b0420e9df79c8234ee85ede71c'],
  ['docs/assessment/BETA_RELEASE_GATES.requirements.json', 'b6c2247277f0d9cf0186fb3f47baa6b26fd12bcf4fbbf615f554bdc887c5e459'],
];
for (const [file, expected] of pinned) assert.equal(hash(JSON.stringify(JSON.parse(await read(file)))), expected, `${file}: immutable handoff content`);
const original = JSON.parse(await read(pinned[0][0])), beta = JSON.parse(await read(pinned[1][0]));
assert.equal(original.cases.length, 64); assert.equal(beta.cases.length, 126);
assert.deepEqual(original.cases.map(row => row.id), Array.from({ length: 64 }, (_, i) => `INT-${String(i + 1).padStart(3, '0')}`));
assert.deepEqual(beta.cases.map(row => row.id), Array.from({ length: 126 }, (_, i) => `BETA-${String(i + 1).padStart(3, '0')}`));
for (const row of [...original.cases, ...beta.cases]) for (const key of ['layer', 'title', 'given', 'expected']) assert.ok(typeof row[key] === 'string' && row[key].length);
receipt('all 64 original requirements and reported history plus 126 beta requirements and gates remain immutable');
for (const [file, expected] of [
  ['scripts/assessment-reference/engine.test.mjs', '80f07ea37996fd1e37ee947afd1ebf3323b8a0521a42472ee4fb753deee7d844'],
  ['scripts/assessment-reference/matching.test.mjs', '4057bed5b0fe5f04f8be17cd8004c256671a3977f98dacbe33227860209b8892'],
]) assert.equal(hash((await read(file)).replace(/\r\n/g, '\n')), expected, 'Original reference assertions were changed');
receipt('retained 86 and 97 original reference assertions have unchanged normalized bytes');
assert.equal(hash(JSON.stringify(JSON.parse(await read('.agent-checks.allowlist.json')))), '8bcae181d21321b79e1cee4976a6c9759a0f03769dde64b6f821ab5d22a33921');
receipt('agent boundary allowlist has no additions or concealed exclusions');
for (const file of ['docs/BETA_OPERATIONS.md', 'docs/BETA_SOURCES.md', 'docs/BETA_COMPARISON.md', 'docs/API_BETA_CONTRACTS.md', 'docs/BETA_VERIFICATION.md', 'docs/BETA_EXECUTION_STATE.md']) {
  const contents = await read(file);
  for (const match of contents.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    const target = match[1]; if (/^[a-z]+:/i.test(target) || target.startsWith('/')) continue;
    await access(resolve(dirname(resolve(root, file)), decodeURIComponent(target)));
  }
}
const readme = await read('README.md');
for (const setting of ['ASSESSMENT_MODE', 'ASSESSMENT_BETA_APPROVALS_PATH', 'ASSESSMENT_RECOVERY_MONGODB_URI', 'ASSESSMENT_RECOVERY_IDENTITY_KEY', 'ASSESSMENT_ALERT_WEBHOOK_URL']) assert.ok(readme.includes(setting));
const review = JSON.parse(await read('docs/assessment/BETA_DATA_FLOW_REVIEW.json'));
assert.ok(JSON.stringify(review).includes('BLOCKED_EXTERNAL'));
receipt('operator data-flow API and verification documentation links resolve and environment contract is documented');
const boundary = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', 'scripts/assessment-reference/boundaries.test.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000 });
const output = `${boundary.stdout ?? ''}${boundary.stderr ?? ''}`;
const totals = Object.fromEntries([...output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)].map(match => [match[1], Number(match[2])]));
assert.equal(boundary.status, 0); assert.deepEqual(totals, { tests: 65, pass: 65, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
for (const match of output.matchAll(/^ok \d+ - (.+)$/gm)) receipt(match[1]);
receipt('all 65 retained permission context applied-capacity and temporal boundary assertions pass without skips');
