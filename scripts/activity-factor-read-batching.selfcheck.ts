import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const servicePath = resolve(
  process.cwd(),
  'src/domain/services/activityFactorRuntime.service.ts'
);
const source = readFileSync(servicePath, 'utf8');

const readStart = source.indexOf(
  'const readActivityRecommendationInputsInSession'
);
const readEnd = source.indexOf('\nexport const toDomainEvidenceEvent', readStart);
assert.ok(readStart >= 0 && readEnd > readStart, 'recommendation reader not found');
const readSource = source.slice(readStart, readEnd);

const countMatches = (pattern: RegExp): number =>
  [...readSource.matchAll(pattern)].length;

assert.equal(
  countMatches(/PairFactorSnapshot\.find\(/g),
  1,
  'referenced pair snapshots must use one batched query'
);
assert.equal(
  countMatches(/PairFactorSnapshot\.aggregate</g),
  1,
  'latest pair snapshots must be selected by one server-side aggregate'
);
assert.equal(
  countMatches(/PairFactorEvaluationSnapshot\.aggregate</g),
  1,
  'latest current-strategy evaluations must use one server-side aggregate'
);
assert.equal(
  countMatches(/IndividualFactorSnapshot\.find\(/g),
  1,
  'all referenced individual snapshots must be loaded once'
);
assert.equal(
  countMatches(/EvidenceEvent\.find\(/g),
  1,
  'all referenced evidence must be loaded once'
);
assert.doesNotMatch(
  readSource,
  /(?:EvidenceEvent|IndividualFactorSnapshot|PairFactorSnapshot|PairFactorEvaluationSnapshot)\.findOne\(/,
  'recommendation reads must not fall back to per-record findOne calls'
);
for (const boundedStage of ['$group', '$first', '$limit']) {
  assert.ok(
    readSource.includes(boundedStage),
    `server-side latest-per-factor selection must include ${boundedStage}`
  );
}
assert.match(
  readSource,
  /\$or: ACTIVITY_RECOMMENDATION_EVALUATION_IDENTITIES/,
  'current strategy identity must be filtered before newest evaluation selection'
);
for (const lifecycleInvariant of [
  'mongoose.startSession()',
  'session.withTransaction',
  'Pair.findOneAndUpdate',
  "status: { $in: ['active', 'paused'] }",
  '$inc: { lifecycleRevision: 1 }',
  'timestamps: false',
  'beforeTransactionalPairLifecycleFence',
  "ActivityFactorRuntimeError('PAIR_NOT_AVAILABLE')",
]) {
  assert.ok(
    readSource.includes(lifecycleInvariant),
    `activity Factor read must retain lifecycle invariant ${lifecycleInvariant}`
  );
}
assert.ok(
  readSource.indexOf('beforeTransactionalPairLifecycleFence') <
    readSource.indexOf('fencePairForActivityFactorRead({'),
  'deterministic race hook must run before the transactional Pair write fence'
);
assert.match(
  readSource,
  /materializeCurrentPairFactorSnapshots\(\{[\s\S]*?session: input\.session/,
  'lazy Pair Factor materialization must receive the transaction session'
);

const pairMaterializationStart = source.indexOf(
  'async function materializeCurrentPairFactorSnapshots'
);
const pairMaterializationEnd = source.indexOf(
  '\nconst feedbackFingerprint',
  pairMaterializationStart
);
assert.ok(
  pairMaterializationStart >= 0 && pairMaterializationEnd > pairMaterializationStart,
  'lazy Pair Factor materializer not found'
);
const pairMaterializationSource = source.slice(
  pairMaterializationStart,
  pairMaterializationEnd
);
assert.match(
  pairMaterializationSource,
  /session: ClientSession/,
  'lazy Pair Factor materialization must require one ClientSession'
);
assert.doesNotMatch(
  pairMaterializationSource,
  /Pair\.(?:find|findOne|findOneAndUpdate)\(/,
  'materializer must use the members returned by the transactional lifecycle fence'
);
assert.match(
  pairMaterializationSource,
  /memberIds: readonly \[string, string\]/,
  'materializer must require fenced Pair members'
);

const firstValidationLoop = readSource.indexOf('\n  for (');
assert.ok(firstValidationLoop >= 0, 'in-memory validation loops not found');
assert.doesNotMatch(
  readSource.slice(firstValidationLoop),
  /await\s+(?:EvidenceEvent|IndividualFactorSnapshot|PairFactorSnapshot|PairFactorEvaluationSnapshot)\./,
  'database reads must complete before in-memory validation loops begin'
);

for (const batchKey of [
  'referencedIndividualSnapshotIds',
  'referencedPairSnapshotIds',
  'referencedEvidenceIds',
]) {
  assert.match(
    readSource,
    new RegExp(`\\$in: ${batchKey}`),
    `${batchKey} must be queried with one $in batch`
  );
}

const evidenceReadStart = source.indexOf('const canonicalEvidenceFor');
const evidenceReadEnd = source.indexOf(
  '\nconst calculatedAtFor',
  evidenceReadStart
);
assert.ok(
  evidenceReadStart >= 0 && evidenceReadEnd > evidenceReadStart,
  'bounded canonical evidence reader not found'
);
const evidenceReadSource = source.slice(evidenceReadStart, evidenceReadEnd);
for (const evidenceBound of [
  'observedAt',
  'recordedAt',
  '$lte',
  'earliestObservedAt',
  '.limit(selection.maximumEvents)',
]) {
  assert.ok(
    evidenceReadSource.includes(evidenceBound),
    `canonical evidence query must retain ${evidenceBound}`
  );
}
assert.doesNotMatch(
  source,
  /Promise\.all/,
  'activity Factor runtime must not run parallel operations on one ClientSession'
);
assert.equal(
  [...source.matchAll(/!isRetryableMaterializationError\(error\) \|\|\s*input\.session/g)]
    .length,
  3,
  'all snapshot/evaluation writers must let retryable conflicts escape an outer transaction'
);

const validationStart = source.indexOf('const isCanonicalEvidenceRecord');
const validationEnd = source.indexOf(
  'export async function ensureActivityFactorEngineReady',
  validationStart
);
assert.ok(
  validationStart >= 0 && validationEnd > validationStart,
  'recommendation validation helpers not found'
);
const validationSource = source.slice(validationStart, validationEnd);
assert.doesNotMatch(
  validationSource,
  /(?:EvidenceEvent|IndividualFactorSnapshot|PairFactorSnapshot|PairFactorEvaluationSnapshot)\.(?:find|findOne)\(/,
  'provenance validation helpers must remain query-free'
);
for (const invariant of [
  'PAIR_MODEL_ONLY',
  'SHARED',
  'PAIR_CONTEXT',
  'registryVersion',
  'definitionVersion',
  'algorithmVersion',
  'snapshotVersion',
  'observationScope',
  'purpose',
  'measurementVersion',
  'instrumentVersion',
]) {
  assert.ok(
    validationSource.includes(invariant),
    `fail-closed invariant ${invariant} must remain explicit`
  );
}

console.log('activity factor recommendation read batching selfcheck passed');
