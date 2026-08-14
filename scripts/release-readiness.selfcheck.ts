import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRuntimeEnv } from '@/lib/config/runtimeEnv';
import {
  formatReleaseCommandFailure,
  releaseReasonCounts,
  ReleaseCommandFailure,
  serializeReleaseCommandEvidence,
} from './lib/release-command-output';

const valid = {
  NODE_ENV: 'test' as const,
  MONGODB_URI: 'mongodb://127.0.0.1:27018/foreverapp_test',
  JWT_SECRET: 'j'.repeat(32),
  NEXT_PUBLIC_DISCORD_CLIENT_ID: 'discord-client',
  DISCORD_CLIENT_SECRET: 'discord-secret',
  NEXT_PUBLIC_DISCORD_REDIRECT_URI: 'https://example.test/auth/callback',
  BILLING_MODE: 'disabled',
};

assert.equal(validateRuntimeEnv(valid).ok, true);

const missing = validateRuntimeEnv({});
assert.equal(missing.ok, false);
if (!missing.ok) {
  assert.ok(missing.fields.includes('MONGODB_URI'));
  assert.ok(missing.fields.includes('JWT_SECRET'));
}

const missingRedirect = validateRuntimeEnv({
  ...valid,
  NEXT_PUBLIC_DISCORD_REDIRECT_URI: undefined,
});
assert.equal(missingRedirect.ok, false);
if (!missingRedirect.ok) {
  assert.ok(missingRedirect.fields.includes('DISCORD_REDIRECT_URI'));
}

const weakSecret = validateRuntimeEnv({ ...valid, JWT_SECRET: 'short' });
assert.equal(weakSecret.ok, false);
if (!weakSecret.ok) assert.ok(weakSecret.fields.includes('JWT_SECRET'));

const billingWithoutSecret = validateRuntimeEnv({
  ...valid,
  BILLING_MODE: 'sandbox',
});
assert.equal(billingWithoutSecret.ok, false);
if (!billingWithoutSecret.ok) {
  assert.ok(billingWithoutSecret.fields.includes('BILLING_WEBHOOK_SECRET'));
}

assert.equal(
  validateRuntimeEnv({ ...valid, TRUSTED_PROXY_MODE: 'x-forwarded-for' }).ok,
  true
);
const invalidProxyMode = validateRuntimeEnv({
  ...valid,
  TRUSTED_PROXY_MODE: 'trust-anything',
});
assert.equal(invalidProxyMode.ok, false);
if (!invalidProxyMode.ok) {
  assert.ok(invalidProxyMode.fields.includes('TRUSTED_PROXY_MODE'));
}

const source = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');
const liveRoute = source('src/app/api/health/live/route.ts');
const readyRoute = source('src/app/api/health/ready/route.ts');
const proxy = source('src/proxy.ts');
const nextConfig = source('next.config.ts');
const rootLayout = source('src/app/layout.tsx');
const mongodb = source('src/lib/mongodb.ts');
const preflight = source('scripts/release-preflight.ts');
const weeklyMigration = source('scripts/migrate-weekly-checkins-pair-scope.ts');
const pairContextMigration = source('scripts/migrate-pair-context-index.ts');
const operationalEvents = source('src/lib/observability/operationalEvents.ts');
const releaseWrapperPaths = [
  'scripts/release-preflight.ts',
  'scripts/migrate-factor-engine.ts',
  'scripts/migrate-pair-events-new-only.ts',
  'scripts/migrate-pair-context-index.ts',
  'scripts/migrate-partner-signals.ts',
  'scripts/migrate-privacy-requests-v2.ts',
  'scripts/migrate-weekly-checkins-pair-scope.ts',
] as const;
assert.ok(liveRoute.includes("status: 'live'"));
assert.ok(readyRoute.includes("status: 'ready'"));
assert.ok(readyRoute.includes("'NOT_READY'"));
assert.ok(readyRoute.includes("database.admin().ping()"));
assert.ok(!readyRoute.includes('environment.fields'));
assert.ok(!readyRoute.includes('error.message'));
assert.ok(proxy.includes("requestHeaders.set('x-request-id', requestId)"));
assert.ok(proxy.includes("response.headers.set('x-request-id', requestId)"));
assert.ok(proxy.includes("'nonce-${nonce}' 'strict-dynamic'"));
assert.ok(
  proxy.includes(
    "frame-ancestors 'self' https://discord.com https://*.discord.com https://discordapp.com https://*.discordapp.com https://staging.discord.co"
  )
);
assert.ok(proxy.includes("requestHeaders.set('Content-Security-Policy'"));
assert.ok(proxy.includes("response.headers.set('Content-Security-Policy'"));
assert.ok(!proxy.match(/script-src[^\n]*unsafe-inline/));
assert.ok(rootLayout.includes('await connection()'));
assert.ok(!nextConfig.includes('Content-Security-Policy'));
assert.ok(nextConfig.includes("source: '/.proxy/api/:path*'"));
assert.ok(nextConfig.includes("destination: '/api/:path*'"));
assert.ok(mongodb.includes('autoIndex: false'));
const legacyWeeklyBlocker = preflight.indexOf(
  "key: 'legacy-weekly-user-week-unique-index'"
);
const legacyPairBlocker = preflight.indexOf(
  "key: 'legacy-pair-key-unique-index'"
);
const blockerEvaluation = preflight.indexOf('const blockers = findings.filter');
const additiveIndexApply = preflight.indexOf('if (applyIndexes)');
assert.ok(legacyWeeklyBlocker >= 0);
assert.ok(legacyPairBlocker >= 0);
assert.ok(preflight.includes('count: legacyWeeklyUniqueIndexes.length'));
assert.ok(preflight.includes('count: legacyPairUniqueIndexes.length'));
assert.ok(preflight.includes("key: 'stale-materialized-factor-markers'"));
assert.ok(preflight.includes('runFactorEngineMigration'));
assert.match(
  preflight,
  /key: 'legacy-weekly-user-week-unique-index',[\s\S]*?blocking: true,/
);
assert.ok(legacyWeeklyBlocker < blockerEvaluation);
assert.ok(legacyPairBlocker < blockerEvaluation);
assert.ok(blockerEvaluation < additiveIndexApply);
assert.match(
  preflight,
  /if \(extraIndexCount > 0\) \{[\s\S]*?ReleaseCommandFailure\('EXTRA_INDEXES_BLOCKED'\)/
);
assert.ok(
  preflight.indexOf('if (extraIndexCount > 0)') < additiveIndexApply,
  'undeclared indexes must block before additive index application'
);
assert.ok(!preflight.includes('accepted temporarily'));
assert.ok(!preflight.includes('toleratesLegacyWeeklyUnique'));
assert.ok(
  pairContextMigration.includes("ReleaseCommandFailure('MODE_INVALID')")
);
assert.ok(
  pairContextMigration.includes("{ INDEXES_READY: 1 }")
);
assert.ok(
  weeklyMigration.includes("ReleaseCommandFailure('MODE_INVALID')")
);
assert.ok(
  weeklyMigration.includes("{ INDEXES_READY: 1 }")
);
assert.ok(weeklyMigration.includes('legacyIndexesAfterDrop.length > 0'));
assert.ok(weeklyMigration.includes('finalLegacyUniqueIndexes.length > 0'));
assert.ok(
  weeklyMigration.includes(
    "throw new ReleaseCommandFailure('INDEX_APPLY_INCOMPLETE')"
  )
);
assert.ok(
  weeklyMigration.includes(
    'legacyUniqueIndexesAfter: finalLegacyUniqueIndexes.length'
  )
);
assert.ok(
  weeklyMigration.includes(
    '{ LEGACY_INDEX_REVIEW_REQUIRED: 1 }'
  )
);
assert.ok(
  pairContextMigration.indexOf(
    'dropLegacyUnique && !applyAdditiveIndexes'
  ) < pairContextMigration.indexOf('connectToDatabase()')
);
assert.ok(
  weeklyMigration.indexOf('dropLegacyUnique && !applyAdditiveIndexes') <
    weeklyMigration.indexOf('connectToDatabase()')
);
const indexedModelFiles = readdirSync(join(process.cwd(), 'src/models'))
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => {
    const modelSource = source('src/models/' + file);
    return (
      /\.index\s*\(/.test(modelSource) ||
      /\bindex\s*:\s*true/.test(modelSource) ||
      /\bunique\s*:\s*true/.test(modelSource) ||
      /\bexpires\s*:/.test(modelSource)
    );
  });
const preflightModelsBlock =
  preflight.match(/const models = \[([\s\S]*?)\];/)?.[1] ?? '';
for (const file of indexedModelFiles) {
  const modelSource = source('src/models/' + file);
  const exportName = file.replace(/\.ts$/, '');
  assert.ok(
    modelSource.includes('export const ' + exportName),
    file + ' must export its indexed model as a named const'
  );
  assert.ok(
    preflight.includes(
      "from '@/models/" + file.replace(/\.ts$/, '') + "'"
    ),
    file + ' must be imported by release-preflight.ts'
  );
  assert.match(
    preflightModelsBlock,
    new RegExp('\\b' + exportName + '\\b'),
    file + ' must be listed in the release preflight index registry'
  );
}
assert.ok(operationalEvents.includes("console.info('operational_event'"));
assert.ok(!operationalEvents.includes('userId'));
assert.ok(!operationalEvents.includes('pairId'));
assert.ok(!operationalEvents.includes('inviteToken'));

const releaseOutputSentinel =
  'mongodb://user:secret@target.example/private_db?token=sentinel';
const genericFailure = new Error(
  `E11000 duplicate key ${releaseOutputSentinel} C:\\private\\release.ts:42`
);
const genericFailureOutput = serializeReleaseCommandEvidence(
  formatReleaseCommandFailure(genericFailure)
);
assert.deepEqual(JSON.parse(genericFailureOutput), {
  counts: {},
  reasonCounts: { COMMAND_FAILED: 1 },
  indexNames: [],
});
assert.ok(!genericFailureOutput.includes(releaseOutputSentinel));
assert.ok(!genericFailureOutput.includes('E11000'));
assert.ok(!genericFailureOutput.includes('private_db'));
assert.ok(!genericFailureOutput.includes('release.ts'));

const typedFailure = new ReleaseCommandFailure('MODE_INVALID');
typedFailure.message = releaseOutputSentinel;
const typedFailureOutput = serializeReleaseCommandEvidence(
  formatReleaseCommandFailure(typedFailure)
);
assert.deepEqual(JSON.parse(typedFailureOutput), {
  counts: {},
  reasonCounts: { MODE_INVALID: 1 },
  indexNames: [],
});
assert.ok(!typedFailureOutput.includes(releaseOutputSentinel));

const unknownReasonCounts = releaseReasonCounts({
  [releaseOutputSentinel]: 2,
});
assert.deepEqual(unknownReasonCounts, { UNCLASSIFIED_DATA_REASON: 2 });
assert.ok(!JSON.stringify(unknownReasonCounts).includes(releaseOutputSentinel));

const sortedEvidence = serializeReleaseCommandEvidence({
  counts: { zCount: 2, aCount: 1 },
  reasonCounts: { MODE_INVALID: 1, COMMAND_FAILED: 2 },
  indexNames: [
    'userId_1_weekKey_1',
    'expiresAt_1',
    'userId_1_weekKey_1',
  ],
});
assert.equal(
  sortedEvidence,
  '{"counts":{"aCount":1,"zCount":2},"reasonCounts":{"COMMAND_FAILED":2,"MODE_INVALID":1},"indexNames":["expiresAt_1","userId_1_weekKey_1"]}'
);
assert.throws(
  () =>
    serializeReleaseCommandEvidence({
      counts: { unsafe_count_name: 1 },
      reasonCounts: {},
      indexNames: [],
    }),
  ReleaseCommandFailure
);
assert.throws(
  () => releaseReasonCounts({ MODE_INVALID: -1 }),
  ReleaseCommandFailure
);
assert.throws(
  () =>
    serializeReleaseCommandEvidence({
      counts: {},
      reasonCounts: {},
      indexNames: [releaseOutputSentinel],
    }),
  (error: Error) =>
    error instanceof ReleaseCommandFailure &&
    error.reasonCode === 'OUTPUT_POLICY_VIOLATION'
);

for (const wrapperPath of releaseWrapperPaths) {
  const wrapper = source(wrapperPath);
  assert.ok(
    wrapper.includes('writeReleaseCommandFailure(error)'),
    wrapperPath + ' must route failures through the release sanitizer'
  );
  assert.ok(
    !/console\.error\s*\(\s*error\.(?:message|stack)/.test(wrapper),
    wrapperPath + ' must not print raw Error fields'
  );
  assert.ok(
    !wrapper.includes('database: databaseName'),
    wrapperPath + ' must not emit the target database name'
  );
  assert.ok(
    !wrapper.includes('JSON.stringify(report)'),
    wrapperPath + ' must not serialize an unrestricted migration report'
  );
}

for (const wrapperPath of releaseWrapperPaths.filter(
  (path) =>
    path !== 'scripts/release-preflight.ts' &&
    path !== 'scripts/migrate-partner-signals.ts'
)) {
  const wrapper = source(wrapperPath);
  assert.ok(
    wrapper.lastIndexOf('.finally(') < wrapper.lastIndexOf('.catch('),
    wrapperPath + ' must sanitize cleanup rejections after finally'
  );
}

console.log('release readiness selfcheck passed');
