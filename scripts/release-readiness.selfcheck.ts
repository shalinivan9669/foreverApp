import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRuntimeEnv } from '@/lib/config/runtimeEnv';

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
const operationalEvents = source('src/lib/observability/operationalEvents.ts');
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
const blockerEvaluation = preflight.indexOf('const blockers = findings.filter');
const additiveIndexApply = preflight.indexOf('if (applyIndexes)');
assert.ok(legacyWeeklyBlocker >= 0);
assert.ok(preflight.includes('count: legacyWeeklyUniqueIndexes.length'));
assert.match(
  preflight,
  /key: 'legacy-weekly-user-week-unique-index',[\s\S]*?blocking: true,/
);
assert.ok(legacyWeeklyBlocker < blockerEvaluation);
assert.ok(blockerEvaluation < additiveIndexApply);
assert.ok(!preflight.includes('accepted temporarily'));
assert.ok(!preflight.includes('toleratesLegacyWeeklyUnique'));
assert.ok(
  weeklyMigration.includes(
    'no legacy unique index was present; non-unique user/week lookup is ready'
  )
);
assert.ok(
  weeklyMigration.includes(
    '--drop-legacy-unique requires --apply-additive-indexes; no indexes were changed'
  )
);
assert.ok(weeklyMigration.includes('legacyIndexesAfterDrop.length > 0'));
assert.ok(weeklyMigration.includes('finalLegacyUniqueIndexes.length > 0'));
assert.ok(
  weeklyMigration.includes(
    'const legacyIndexOutcome = finalLegacyUniqueIndexes.length > 0'
  )
);
assert.ok(
  weeklyMigration.includes(
    'legacy unique index removed; non-unique user/week lookup is ready'
  )
);
assert.ok(
  weeklyMigration.includes(
    'legacy unique index retained; release preflight remains blocked'
  )
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

console.log('release readiness selfcheck passed');
