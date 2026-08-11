import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const source = (path: string): string =>
  readFileSync(join(root, path), 'utf8');

const removedPaths = [
  'src/domain/vectors',
  'src/domain/services/vectorScoring.service.ts',
  'src/domain/services/pairDiagnostics.service.ts',
  'src/domain/services/pairAnswerScoring.service.ts',
  'src/domain/services/insightRules.service.ts',
  'src/models/VectorSnapshot.ts',
  'src/models/Insight.ts',
  'src/models/ScoringVersion.ts',
  'src/models/Question.ts',
  'src/app/api/answers/bulk/route.ts',
  'src/app/api/questions/route.ts',
  'src/app/api/insights/me/route.ts',
  'src/app/api/pairs/[id]/insights/route.ts',
  'src/app/api/pairs/[id]/diagnostics/route.ts',
  'src/app/api/match/accept/route.ts',
  'src/app/api/match/card/[id]/route.ts',
  'src/app/api/match/card/route.ts',
  'src/app/api/match/confirm/route.ts',
  'src/app/api/match/feed/route.ts',
  'src/app/api/match/inbox/route.ts',
  'src/app/api/match/like/[id]/route.ts',
  'src/app/api/match/like/projectResponse.ts',
  'src/app/api/match/like/route.ts',
  'src/app/api/match/reject/route.ts',
  'src/app/api/match/respond/route.ts',
  'src/app/pair/[id]/diagnostics/page.tsx',
  'src/components/charts/AxisRadar.tsx',
  'src/components/ui/PaywallView.tsx',
] as const;

for (const path of removedPaths) {
  assert.equal(existsSync(join(root, path)), false, `${path} must stay removed`);
}

const sourceFiles: string[] = [];
const visit = (directory: string): void => {
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    if (statSync(absolute).isDirectory()) {
      visit(absolute);
    } else if (/\.(?:ts|tsx)$/.test(name)) {
      sourceFiles.push(absolute);
    }
  }
};
visit(join(root, 'src'));

const forbiddenImport =
  /@\/domain\/vectors|@\/models\/(?:VectorSnapshot|Insight|ScoringVersion|Question)(?:'|")|@\/domain\/services\/(?:vectorScoring|pairDiagnostics|pairAnswerScoring|insightRules)\.service/;
for (const absolute of sourceFiles) {
  const code = readFileSync(absolute, 'utf8');
  assert.doesNotMatch(
    code,
    forbiddenImport,
    `${relative(root, absolute)} imports the retired six-axis runtime`
  );
}

const userModel = source('src/models/User.ts');
assert.doesNotMatch(userModel, /\bvectors(?:Meta)?\b|UserAxisVector|VectorLayer/);
assert.doesNotMatch(userModel, /\breadiness\??:|\bfatigue\??:/);

const pairModel = source('src/models/Pair.ts');
assert.doesNotMatch(pairModel, /\bpassport\b|\breadiness\??:|\bfatigue\??:/);

const weeklyService = source('src/domain/services/weeklyCheckIn.service.ts');
assert.doesNotMatch(
  weeklyService,
  /summarizePairWeeklyCheckIns|buildPairWeeklyCheckInSummary|\?\?\s*0\.5/
);

for (const path of [
  'src/app/api/checkins/weekly/route.ts',
  'src/app/api/checkins/weekly/current/route.ts',
  'src/app/api/pairs/[id]/weekly-cycle/current/route.ts',
  'src/app/api/pairs/[id]/recommendations/route.ts',
  'src/app/api/pairs/[id]/activities/suggest/route.ts',
  'src/app/api/pairs/[id]/activities/from-template/route.ts',
  'src/app/api/pairs/[id]/suggest/route.ts',
  'src/app/api/activities/next/route.ts',
]) {
  assert.doesNotMatch(
    source(path),
    /@\/lib\/entitlements|resolveEntitlements|assertEntitlement|assertQuota|ENTITLEMENT_REQUIRED|PAYMENT_REQUIRED|\b402\b/,
    `${path} must remain free of billing gates`
  );
}

const packageJson = source('package.json');
assert.doesNotMatch(
  packageJson,
  /selfcheck:(?:vectors|vector-e2e|pair-diagnostics|insights-safety|backfill-vectors)|backfill:vector-snapshots|seed:questions/
);

console.log('legacy cutover selfcheck passed');
