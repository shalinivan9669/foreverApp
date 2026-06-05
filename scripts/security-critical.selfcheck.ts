import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { matchTransition } from '../src/domain/state/matchMachine';
import { getUserProfileStatus, toUserDTO } from '../src/lib/dto/user.dto';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const extractBetween = (source: string, start: string, end: string): string => {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
};

const isAllowedRedirect = (redirectUri: string, expectedRedirectUri: string | null): boolean =>
  expectedRedirectUri !== null && redirectUri === expectedRedirectUri;

const run = () => {
  const usersService = readProjectFile('src/domain/services/users.service.ts');
  assert.match(
    usersService,
    /actorUserId !== targetUserId/,
    'by-id user writes must compare actor and target user ids'
  );
  assert.match(
    usersService,
    /code:\s*'ACCESS_DENIED'[\s\S]*status:\s*403[\s\S]*message:\s*'forbidden'/,
    'actor A must receive ACCESS_DENIED when attempting to update actor B'
  );

  const usersMeRoute = readProjectFile('src/app/api/users/me/route.ts');
  assert.match(
    usersMeRoute,
    /currentUserId:\s*userId/,
    '/api/users/me should pass the session user id into the service'
  );

  const usersRoute = readProjectFile('src/app/api/users/route.ts');
  const usersByIdRoute = readProjectFile('src/app/api/users/[id]/route.ts');
  assert.match(
    usersByIdRoute,
    /export async function GET\(req: NextRequest[\s\S]*requireSession\(req\)/,
    'GET /api/users/[id] should require session auth to prevent unauthenticated user enumeration'
  );
  assert.match(
    usersByIdRoute,
    /toUserDTO\(doc,\s*{\s*scope:\s*'public'\s*}\)/,
    'GET /api/users/[id] should keep returning only public DTO fields'
  );
  const userProfileUpsertType = extractBetween(
    readProjectFile('src/client/api/types.ts'),
    'export type UserProfileUpsertRequest',
    'export type UserOnboardingSeekingPatch'
  );
  for (const [name, source] of [
    ['users.service', usersService],
    ['/api/users', usersRoute],
    ['/api/users/me', usersMeRoute],
    ['/api/users/[id]', usersByIdRoute],
    ['UserProfileUpsertRequest', userProfileUpsertType],
  ] as const) {
    assert.doesNotMatch(
      source,
      /\bvectors\b/,
      `${name} must not accept direct profile vector writes`
    );
    assert.doesNotMatch(
      source,
      /\bembeddings\b/,
      `${name} must not accept direct profile embedding writes`
    );
  }
  for (const [name, source] of [
    ['/api/users', usersRoute],
    ['/api/users/me', usersMeRoute],
    ['/api/users/[id]', usersByIdRoute],
  ] as const) {
    assert.match(source, /type:\s*z\.literal\('Point'\)/, `${name} should require GeoJSON Point`);
    assert.match(source, /z\.number\(\)\.min\(-180\)\.max\(180\)/, `${name} should bound longitude`);
    assert.match(source, /z\.number\(\)\.min\(-90\)\.max\(90\)/, `${name} should bound latitude`);
  }

  const publicUser = toUserDTO(
    {
      id: 'user-a',
      username: 'alice',
      avatar: 'avatar',
      personal: {
        gender: 'female',
        age: 25,
        city: 'Qyzylorda',
        relationshipStatus: 'seeking',
      },
      profile: {
        onboarding: {
          seeking: {
            valuedQualities: ['a', 'b', 'c'],
            relationshipPriority: 'emotional_intimacy',
            minExperience: 'none',
            dealBreakers: 'none',
            firstDateSetting: 'cafe',
            weeklyTimeCommitment: '5-10h',
          },
        },
      },
    },
    { scope: 'public' }
  );
  assert.deepEqual(
    Object.keys(publicUser).sort(),
    ['avatar', 'id', 'username'],
    'public user DTO must not expose private profile fields'
  );

  assert.equal(
    getUserProfileStatus({}),
    'auth_created',
    'partial auth-created users should have an explicit lifecycle state'
  );
  assert.equal(
    getUserProfileStatus({
      personal: {
        gender: 'male',
        age: 30,
        city: 'Qyzylorda',
        relationshipStatus: 'seeking',
      },
    }),
    'onboarding_started',
    'personal profile without onboarding should be onboarding_started'
  );
  assert.equal(
    getUserProfileStatus({
      personal: {
        gender: 'male',
        age: 30,
        city: 'Qyzylorda',
        relationshipStatus: 'seeking',
      },
      profile: {
        onboarding: {
          seeking: {
            valuedQualities: ['a', 'b', 'c'],
            relationshipPriority: 'emotional_intimacy',
            minExperience: 'none',
            dealBreakers: 'none',
            firstDateSetting: 'cafe',
            weeklyTimeCommitment: '5-10h',
          },
        },
      },
    }),
    'complete',
    'completed onboarding should resolve to complete lifecycle state'
  );

  assert.equal(
    isAllowedRedirect('https://example.com/callback', 'https://example.com/callback'),
    true,
    'expected redirect_uri should be accepted'
  );
  assert.equal(
    isAllowedRedirect('https://evil.example/callback', 'https://example.com/callback'),
    false,
    'unexpected redirect_uri should be rejected'
  );
  const exchangeCodeRoute = readProjectFile('src/app/api/exchange-code/route.ts');
  assert.match(
    exchangeCodeRoute,
    /expectedRedirectUri !== null && redirectUri === expectedRedirectUri/,
    'OAuth redirect_uri validation should be exact-match against server expected value'
  );
  assert.match(
    exchangeCodeRoute,
    /jsonError\(400,\s*'INVALID_REDIRECT_URI',\s*'invalid redirect_uri'\)/,
    'invalid redirect_uri should return the documented 400'
  );
  assert.match(
    exchangeCodeRoute,
    /DISCORD_REDIRECT_URI_NOT_SET/,
    'OAuth exchange should fail closed when the expected redirect_uri is not configured'
  );
  assert.match(
    exchangeCodeRoute,
    /metadata:\s*{\s*reason,\s*status,\s*}/,
    'OAuth audit failure metadata should stay reason/status only'
  );
  assert.match(
    exchangeCodeRoute,
    /user:\s*{[\s\S]*id:\s*userId,[\s\S]*username,[\s\S]*avatar,[\s\S]*}/,
    'exchange-code should return a minimal Discord profile so browser code avoids a second tokened Discord API call'
  );
  assert.match(
    exchangeCodeRoute,
    /usersService\.upsertCurrentUserProfile\([\s\S]*currentUserId:\s*userId,[\s\S]*username,[\s\S]*normalizeDiscordAvatar\(avatar\)/,
    'exchange-code should persist the basic Discord profile before mobile clients rely on the session cookie'
  );
  assert.match(
    exchangeCodeRoute,
    /Cache-Control',\s*'no-store,\s*no-cache,\s*must-revalidate'/,
    'exchange-code token response should not be cached'
  );
  assert.match(
    exchangeCodeRoute,
    /process\.env\.NODE_ENV === 'production'[\s\S]*forwardedProto === 'https'[\s\S]*requestProtocol === 'https:'/,
    'production Discord session cookie should be Secure/SameSite=None even if proxy headers are incomplete'
  );

  const appPage = readProjectFile('src/app/page.tsx');
  assert.equal(
    existsSync(new URL('../src/client/api/discord.api.ts', import.meta.url)),
    false,
    'client direct Discord API helper should stay removed'
  );
  assert.doesNotMatch(
    appPage,
    /discordApi\.getCurrentUser/,
    'client OAuth flow should not call Discord API directly with the access token'
  );
  assert.doesNotMatch(
    appPage,
    /upsertCurrentUserProfile\(/,
    'client OAuth flow should not require an immediate protected /api/users write after session cookie creation'
  );
  assert.doesNotMatch(
    appPage,
    /console\.error/,
    'client OAuth flow should not log raw errors that may contain token or request details'
  );

  const entitlementsGrantRoute = readProjectFile('src/app/api/entitlements/grant/route.ts');
  assert.match(
    entitlementsGrantRoute,
    /timingSafeEqual/,
    'entitlements admin key comparison should use timing-safe comparison'
  );
  assert.match(
    entitlementsGrantRoute,
    /process\.env\.ENTITLEMENTS_ADMIN_KEY\?\.trim\(\)/,
    'entitlements grant should respect the configured admin key in every environment'
  );
  assert.match(
    entitlementsGrantRoute,
    /process\.env\.NODE_ENV !== 'production' && isLocalRequest\(req\)/,
    'unkeyed entitlement grants should be local-development only'
  );
  assert.doesNotMatch(
    entitlementsGrantRoute,
    /NODE_ENV !== 'production'[\s\S]{0,80}return true/,
    'non-production entitlement grants must not be globally open'
  );

  for (const routePath of [
    'src/app/api/activity-templates/route.ts',
    'src/app/api/questionnaires/route.ts',
    'src/app/api/questionnaires/[id]/route.ts',
    'src/app/api/questions/route.ts',
  ]) {
    const routeSource = readProjectFile(routePath);
    assert.match(
      routeSource,
      /requireSession/,
      `${routePath} should require session auth for closed-beta content`
    );
    assert.match(
      routeSource,
      /if \(!auth\.ok\) return auth\.response/,
      `${routePath} should return the centralized auth response`
    );
  }

  const nextConfig = readProjectFile('next.config.ts');
  assert.match(
    nextConfig,
    /X-Content-Type-Options[\s\S]*nosniff/,
    'Next config should send a MIME-sniffing protection header'
  );
  assert.match(
    nextConfig,
    /Referrer-Policy[\s\S]*no-referrer/,
    'Next config should send a strict referrer policy'
  );
  assert.match(
    nextConfig,
    /Permissions-Policy/,
    'Next config should send a restrictive permissions policy'
  );
  assert.doesNotMatch(
    nextConfig,
    /X-Frame-Options/,
    'Discord embedded app should not set X-Frame-Options; use CSP frame-ancestors instead'
  );
  assert.match(
    nextConfig,
    /frame-ancestors 'self' https:\/\/discord\.com/,
    'CSP should preserve Discord iframe embedding'
  );

  const packageJson = readProjectFile('package.json');
  const tsconfigJson = readProjectFile('tsconfig.json');
  const packageLock = readProjectFile('package-lock.json');
  assert.doesNotMatch(packageJson, /"next-auth"/, 'unused next-auth dependency should stay removed');
  assert.doesNotMatch(tsconfigJson, /next-auth/, 'tsconfig should not reference removed next-auth types');
  assert.doesNotMatch(
    packageLock,
    /node_modules\/next-auth/,
    'package-lock should not include the removed next-auth dependency'
  );

  assert.throws(
    () =>
      matchTransition(
        {
          fromId: 'actor-a',
          toId: 'actor-b',
          status: 'sent',
        },
        { type: 'CONFIRM' },
        { currentUserId: 'actor-a', role: 'from' }
      ),
    { name: 'DomainError', message: 'Forbidden like transition' },
    'confirm should fail if like is not mutual_ready'
  );
  assert.throws(
    () =>
      matchTransition(
        {
          fromId: 'actor-a',
          toId: 'actor-b',
          status: 'paired',
        },
        { type: 'CONFIRM' },
        { currentUserId: 'actor-a', role: 'from' }
      ),
    { name: 'DomainError', message: 'Forbidden like transition' },
    'repeated confirm should be a controlled state conflict'
  );

  const matchService = readProjectFile('src/domain/services/match.service.ts');
  assert.doesNotMatch(
    matchService,
    /Math\.max\(0,\s*Math\.min\(100,\s*75\)\)/,
    'createLike must not use the old placeholder score constant'
  );
  assert.match(
    matchService,
    /const calculateMatchScore = \(left: UserType, right: UserType\): number/,
    'createLike should use explicit vector-based match score policy'
  );
  const likeUpdateIndex = matchService.indexOf('const confirmedLike = await Like.findOneAndUpdate');
  const pairUpdateIndex = matchService.indexOf('const pair = await Pair.findOneAndUpdate');
  assert.ok(likeUpdateIndex >= 0, 'confirmLike should atomically update Like first');
  assert.ok(pairUpdateIndex >= 0, 'confirmLike should upsert Pair after Like update');
  assert.ok(
    likeUpdateIndex < pairUpdateIndex,
    'confirmLike must not create/activate Pair before Like update succeeds'
  );
  assert.match(
    matchService,
    /_id:\s*like\._id,[\s\S]*fromId:\s*input\.currentUserId,[\s\S]*status:\s*'mutual_ready'/,
    'confirmLike atomic update must be scoped to like id, initiator, and mutual_ready status'
  );

  console.log('Security critical self-check passed.');
};

run();
