/** Runs the retained reference assertions against the application's single engine.
 * Does not connect to a database, load dotenv, install packages or emit build files.
 */
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const suites = [
  { file: 'engine.test.mjs', expected: 86 },
  { file: 'matching.test.mjs', expected: 97 },
];
let passed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', '--test', '--test-reporter=tap',
    fileURLToPath(new URL(suite.file, import.meta.url)),
  ], { encoding: 'utf8', timeout: 30_000 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const totals = Object.fromEntries(
    [...output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)]
      .map((match) => [match[1], Number(match[2])]),
  );
  if (result.error || result.status !== 0 || totals.tests !== suite.expected
    || totals.pass !== suite.expected || totals.fail !== 0
    || totals.skipped !== 0 || totals.cancelled !== 0 || totals.todo !== 0) {
    process.stderr.write(`${suite.file}: FAILED\n${output.split(/\r?\n/).slice(-35).join('\n')}\n`);
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exitCode = 1;
    break;
  }
  passed += totals.pass;
  for (const match of output.matchAll(/^\s*ok \d+ - (.+)$/gm)) {
    process.stdout.write(`${JSON.stringify({ suite: 'assessment-reference', file: suite.file, test: match[1], status: 'PASSED' })}\n`);
  }
  process.stdout.write(`${suite.file}: PASS ${totals.pass}/${totals.tests}\n`);
}
if (!process.exitCode) {
  const assessment = new URL('../../src/domain/assessment/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('PROVENANCE.json', assessment), 'utf8'));
  for (const entry of provenance.files.filter((entry) => entry.path.startsWith('catalog/'))) {
    // Git's Windows checkout can use CRLF; provenance pins the original LF text.
    // Normalize only line endings, preserving every definition and other byte.
    const bytes = readFileSync(new URL(entry.path, assessment), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sourceSha256,
      `${entry.path}: original definitions, wording and authoring status must remain intact`);
  }
  const original = JSON.parse(readFileSync(new URL('catalog/original_catalog.v0_1.json', assessment), 'utf8'));
  const bindings = JSON.parse(readFileSync(new URL('catalog/skill_bindings.v0_2.json', assessment), 'utf8'));
  assert.equal(original.skills.length, 54);
  assert.equal(original.other_characteristics.length, 47);
  assert.equal(original.context_pair_safety.length, 24);
  assert.deepEqual(bindings.skills.map((skill) => skill.sourceDefinition), original.skills);
  assert.deepEqual(bindings.nonSkillDefinitionsPreserved, original.other_characteristics);
  process.stdout.write(`Assessment reference: PASS ${passed}/183; application engine, no database.\n`);
  process.stdout.write('Catalog preservation: PASS 54 skills + 47 other definitions + 24 context/pair/safety entries; original SHA-256 hashes match after Git LF normalization.\n');
  process.stdout.write(`${JSON.stringify({ suite: 'assessment-reference', status: 'PASSED', assertion: 'all 183 retained reference assertions and original 54 plus 47 plus 24 catalog definitions pass unchanged', checks: 183 })}\n`);
}
