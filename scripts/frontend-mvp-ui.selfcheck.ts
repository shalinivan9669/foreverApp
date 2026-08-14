import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  HELP_RESOURCE_CATALOG,
  validateHelpCatalog,
} from '../src/client/content/helpCatalog';

const root = process.cwd();
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

const activeUiFiles = [
  'src/app/page.tsx',
  'src/app/invite/page.tsx',
  'src/app/join/page.tsx',
  'src/app/main-menu/page.tsx',
  'src/app/mvp-onboarding/page.tsx',
  'src/app/profile/help/page.tsx',
  'src/app/profile/safety/page.tsx',
  'src/app/questionnaires/page.tsx',
  'src/components/activities/CheckInModal.tsx',
  'src/components/activities/RecommendationDecisionPanel.tsx',
  'src/components/checkins/WeeklyCheckInCard.tsx',
  'src/components/profile/today/PersonalTodayDashboard.tsx',
  'src/components/settings/PrivacySettingsHub.tsx',
  'src/features/activities/CoupleActivityView.tsx',
  'src/features/pair/PairProfilePageClient.tsx',
  'src/app/search/page.tsx',
  'src/app/match-card/create/page.tsx',
  'src/app/match/inbox/page.tsx',
  'src/app/match/like/[id]/page.tsx',
  'src/app/profile/(tabs)/matching/page.tsx',
  'src/features/matching/MatchingFeedPage.tsx',
  'src/features/matching/MatchingProfilePage.tsx',
  'src/features/matching/MatchingInboxPage.tsx',
  'src/features/matching/MatchingLikePage.tsx',
].map(read);

const requiredMatchingUi = [
  'src/client/hooks/useMatchFeed.ts',
  'src/client/hooks/useInbox.ts',
  'src/client/api/match.api.ts',
  'src/components/matching/CandidateCard.tsx',
  'src/components/matching/LikeComposer.tsx',
];

for (const path of requiredMatchingUi) {
  assert.equal(existsSync(resolve(root, path)), true, `${path} must exist`);
}

const globals = read('src/app/globals.css');
assert.match(globals, /safe-area-inset-bottom/);
assert.match(globals, /\.app-shell-narrow/);
assert.match(globals, /overflow-wrap:\s*anywhere/);

const modal = read('src/components/activities/CheckInModal.tsx');
assert.match(modal, /role="dialog"/);
assert.match(modal, /aria-modal="true"/);
assert.match(modal, /event\.key === 'Escape'/);

const privacyHub = read('src/components/settings/PrivacySettingsHub.tsx');
assert.match(privacyHub, /logoutAll/);
assert.match(privacyHub, /role="alertdialog"/);
assert.match(privacyHub, /window\.location\.replace\('\/'\)/);

assert.deepEqual(validateHelpCatalog(HELP_RESOURCE_CATALOG), []);
assert.equal(HELP_RESOURCE_CATALOG.catalogVersion, 'help-ru-v1');
assert.ok(HELP_RESOURCE_CATALOG.sections.every((section) => section.id.trim().length > 0));

const activeUi = activeUiFiles.join('\n');
assert.doesNotMatch(activeUi, /[ÐÑ][\u0080-\u00BF]/, 'active UI contains mojibake');
assert.doesNotMatch(
  activeUi,
  /сервис\s+знакомств|приложени[ея]\s+для\s+знакомств|свайп|дейтинг|премиум|paywall/i,
  'active MVP UI must not expose legacy dating or paywall copy'
);

console.log('Frontend MVP UI self-check passed.');
