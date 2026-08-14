import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { toDomainError } from '../src/domain/errors';
import { getUserProfileStatus, toUserDTO } from '../src/lib/dto/user.dto';
import { jsonOk } from '../src/lib/api/response';
import { MAX_JSON_BODY_BYTES, parseJson } from '../src/lib/api/validate';
import { requireTrustedUnsafeRequest } from '../src/lib/auth/requestSafety';
import {
  auditContextFromRequest,
  clientIpFromRequest,
  parseTrustedProxyMode,
} from '../src/lib/audit/emitEvent';
import {
  buildRateLimitIdentity,
  RATE_LIMIT_POLICIES,
} from '../src/lib/abuse/rateLimit';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const extractBetween = (source: string, start: string, end: string): string => {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(endIndex > startIndex, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
};

const countOccurrences = (source: string, value: string): number =>
  source.split(value).length - 1;

const isAllowedRedirect = (
  redirectUri: string,
  expectedRedirectUri: string | null,
): boolean =>
  expectedRedirectUri !== null && redirectUri === expectedRedirectUri;

const run = async () => {
  const usersService = readProjectFile('src/domain/services/users.service.ts');
  assert.match(
    usersService,
    /actorUserId !== targetUserId/,
    'by-id user writes must compare actor and target user ids',
  );
  assert.match(
    usersService,
    /code:\s*'ACCESS_DENIED'[\s\S]*status:\s*403[\s\S]*message:\s*'forbidden'/,
    'actor A must receive ACCESS_DENIED when attempting to update actor B',
  );

  const usersMeRoute = readProjectFile('src/app/api/users/me/route.ts');
  assert.match(
    usersMeRoute,
    /currentUserId:\s*userId/,
    '/api/users/me should pass the session user id into the service',
  );

  const usersRoute = readProjectFile('src/app/api/users/route.ts');
  const usersByIdRoute = readProjectFile('src/app/api/users/[id]/route.ts');
  assert.match(
    usersByIdRoute,
    /export async function GET\(req: NextRequest[\s\S]*requireSession\(req\)/,
    'GET /api/users/[id] should require session auth to prevent unauthenticated user enumeration',
  );
  assert.match(
    usersByIdRoute,
    /usersService\.getPublicUserProfile\(id\)/,
    'GET /api/users/[id] should delegate its public projection to the user service',
  );
  assert.match(
    usersService,
    /getPublicUserProfile[\s\S]*toUserDTO\(user,\s*{\s*scope:\s*'public'\s*}\)/,
    'the user service should keep returning only public DTO fields',
  );
  const userProfileUpsertType = extractBetween(
    readProjectFile('src/client/api/types.ts'),
    'export type UserProfileUpsertRequest',
    'export type UserOnboardingSeekingPatch',
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
      `${name} must not accept direct profile vector writes`,
    );
    assert.doesNotMatch(
      source,
      /\bembeddings\b/,
      `${name} must not accept direct profile embedding writes`,
    );
  }
  for (const [name, source] of [
    ['/api/users', usersRoute],
    ['/api/users/me', usersMeRoute],
    ['/api/users/[id]', usersByIdRoute],
  ] as const) {
    assert.match(
      source,
      /type:\s*z\.literal\('Point'\)/,
      `${name} should require GeoJSON Point`,
    );
    assert.match(
      source,
      /z\.number\(\)\.min\(-180\)\.max\(180\)/,
      `${name} should bound longitude`,
    );
    assert.match(
      source,
      /z\.number\(\)\.min\(-90\)\.max\(90\)/,
      `${name} should bound latitude`,
    );
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
    { scope: 'public' },
  );
  assert.deepEqual(
    Object.keys(publicUser).sort(),
    ['avatar', 'id', 'username'],
    'public user DTO must not expose private profile fields',
  );

  assert.equal(
    getUserProfileStatus({}),
    'auth_created',
    'partial auth-created users should have an explicit lifecycle state',
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
    'personal profile without onboarding should be onboarding_started',
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
    'completed onboarding should resolve to complete lifecycle state',
  );

  assert.equal(
    isAllowedRedirect(
      'https://example.com/callback',
      'https://example.com/callback',
    ),
    true,
    'expected redirect_uri should be accepted',
  );
  assert.equal(
    isAllowedRedirect(
      'https://evil.example/callback',
      'https://example.com/callback',
    ),
    false,
    'unexpected redirect_uri should be rejected',
  );
  const exchangeCodeRoute = readProjectFile(
    'src/app/api/exchange-code/route.ts',
  );
  const discordOAuthService = readProjectFile(
    'src/domain/services/discordOAuth.service.ts',
  );
  assert.match(
    discordOAuthService,
    /accountWriteBarrierService\.acquireExternal\([\s\S]*userId,[\s\S]*kind:\s*'OAUTH_EXCHANGE'/,
    'Discord OAuth must acquire the account write barrier before recreating a user or session',
  );
  assert.match(
    discordOAuthService,
    /finally\s*{[\s\S]*accountWriteBarrierService\.release\(lease\)/,
    'Discord OAuth must release its account write lease in finally',
  );
  assert.match(
    discordOAuthService,
    /expectedRedirectUri !== null && redirectUri === expectedRedirectUri/,
    'OAuth redirect_uri validation should be exact-match against server expected value',
  );
  assert.match(
    discordOAuthService,
    /failure\(400,\s*'INVALID_REDIRECT_URI',\s*'invalid redirect_uri'\)/,
    'invalid redirect_uri should return the documented 400',
  );
  assert.match(
    discordOAuthService,
    /DISCORD_REDIRECT_URI_NOT_SET/,
    'OAuth exchange should fail closed when the expected redirect_uri is not configured',
  );
  assert.match(
    discordOAuthService,
    /metadata:\s*{\s*reason,\s*status,\s*}/,
    'OAuth audit failure metadata should stay reason/status only',
  );
  const tokenExchangeFailure = extractBetween(
    discordOAuthService,
    'if (!tokenResponse.ok) {',
    'const accessToken',
  );
  assert.doesNotMatch(
    tokenExchangeFailure,
    /tokenPayload|access_token|refresh_token|details/,
    'OAuth token exchange failures must not return or audit Discord token payloads',
  );
  const discordUserFailure = extractBetween(
    discordOAuthService,
    'if (!userResponse.ok) {',
    'const userId',
  );
  assert.doesNotMatch(
    discordUserFailure,
    /userPayload|accessToken|Authorization|details/,
    'Discord user lookup failures must not return or audit upstream payloads or bearer data',
  );
  assert.match(
    discordOAuthService,
    /user:\s*{[\s\S]*id:\s*userId,[\s\S]*username,[\s\S]*avatar,[\s\S]*}/,
    'exchange-code should return a minimal Discord profile so browser code avoids a second tokened Discord API call',
  );
  assert.match(
    discordOAuthService,
    /usersService\.upsertCurrentUserProfile\([\s\S]*currentUserId:\s*userId,[\s\S]*username,[\s\S]*avatar/,
    'exchange-code should persist the basic Discord profile before mobile clients rely on the session cookie',
  );
  assert.match(
    exchangeCodeRoute,
    /session_token:\s*result\.data\.embeddedSessionToken/,
    'exchange-code should return a signed in-memory fallback session token for embedded mobile clients',
  );
  assert.match(
    exchangeCodeRoute,
    /requireTrustedUnsafeRequest\(req,[\s\S]*protectWithoutSessionCookie:\s*true/,
    'exchange-code should reject cross-origin login requests before setting a session cookie',
  );
  assert.match(
    exchangeCodeRoute,
    /process\.env\.NODE_ENV === 'production'[\s\S]*forwardedProto === 'https'[\s\S]*requestProtocol === 'https:'/,
    'production Discord session cookie should be Secure/SameSite=None even if proxy headers are incomplete',
  );

  const appPage = readProjectFile('src/app/page.tsx');
  const discordBootstrap = readProjectFile(
    'src/client/discord/bootstrap.ts',
  );
  assert.equal(
    existsSync(new URL('../src/client/api/discord.api.ts', import.meta.url)),
    false,
    'client direct Discord API helper should stay removed',
  );
  assert.doesNotMatch(
    appPage,
    /discordApi\.getCurrentUser/,
    'client OAuth flow should not call Discord API directly with the access token',
  );
  assert.doesNotMatch(
    appPage,
    /upsertCurrentUserProfile\(/,
    'client OAuth flow should not require an immediate protected /api/users write after session cookie creation',
  );
  assert.doesNotMatch(
    appPage,
    /console\.error/,
    'client OAuth flow should not log raw errors that may contain token or request details',
  );
  assert.match(
    discordBootstrap,
    /Откройте приложение внутри Discord и повторите попытку/,
    'client OAuth failure should explain the embedded re-auth action in readable Russian',
  );
  assert.match(
    appPage,
    /setError\(discordBootstrapMessage\(caught\)\)/,
    'client OAuth flow should render the centralized safe bootstrap error message',
  );
  assert.match(
    appPage,
    /onClick=\{\(\) => void connectDiscord\(\)\}[\s\S]*Повторить подключение/,
    'client OAuth failure should provide an explicit retry action',
  );

  const sessionAuth = readProjectFile('src/lib/auth/session.ts');
  assert.match(
    sessionAuth,
    /getBearerToken[\s\S]*authorization[\s\S]*bearer/,
    'session auth should support Authorization bearer fallback for embedded mobile clients',
  );
  assert.match(
    sessionAuth,
    /cookieToken[\s\S]*verifyJwt\(cookieToken,\s*secret\)[\s\S]*bearerToken[\s\S]*verifyJwt\(bearerToken,\s*secret\)/,
    'session auth should verify both cookie and bearer sessions with JWT_SECRET',
  );

  const authGuards = readProjectFile('src/lib/auth/guards.ts');
  assert.match(
    authGuards,
    /requireTrustedUnsafeRequest\(req\)/,
    'cookie-authenticated mutations should pass through the centralized request-origin guard',
  );

  const sameOriginMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: {
        cookie: 'session=test-token',
        origin: 'https://app.example',
        'sec-fetch-site': 'same-origin',
      },
    }),
  );
  assert.equal(
    sameOriginMutation.ok,
    true,
    'same-origin cookie mutation should be accepted',
  );

  const crossOriginMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: {
        cookie: 'session=test-token',
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    }),
  );
  assert.equal(
    crossOriginMutation.ok,
    false,
    'cross-origin cookie mutation should be rejected',
  );
  if (!crossOriginMutation.ok) {
    assert.equal(crossOriginMutation.response.status, 403);
    const payload = (await crossOriginMutation.response.clone().json()) as {
      error?: { code?: string };
    };
    assert.equal(payload.error?.code, 'REQUEST_ORIGIN_DENIED');
  }

  const missingOriginMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: { cookie: 'session=test-token' },
    }),
  );
  assert.equal(
    missingOriginMutation.ok,
    false,
    'cookie mutation should fail closed without Origin or same-origin Fetch Metadata',
  );

  const bearerOnlyMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: {
        authorization: 'Bearer embedded-session',
        origin: 'https://embedded.example',
        'sec-fetch-site': 'cross-site',
      },
    }),
  );
  assert.equal(
    bearerOnlyMutation.ok,
    true,
    'bearer-only embedded clients should not be subjected to cookie-CSRF checks',
  );

  const forwardedRequest = new Request(
    'https://app.example/api/exchange-code',
    {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.2',
        'x-real-ip': '203.0.113.11',
        'cf-connecting-ip': '203.0.113.12',
      },
    },
  );
  const previousTrustedProxyMode = process.env.TRUSTED_PROXY_MODE;
  delete process.env.TRUSTED_PROXY_MODE;
  try {
    assert.equal(
      clientIpFromRequest(forwardedRequest),
      undefined,
      'raw forwarding headers must be ignored by default',
    );
  } finally {
    if (previousTrustedProxyMode === undefined) {
      delete process.env.TRUSTED_PROXY_MODE;
    } else {
      process.env.TRUSTED_PROXY_MODE = previousTrustedProxyMode;
    }
  }
  assert.equal(parseTrustedProxyMode('unexpected'), 'none');
  assert.equal(
    auditContextFromRequest(forwardedRequest, undefined, {
      trustedProxyMode: 'x-forwarded-for',
    }).ip,
    '203.0.113.10',
  );
  assert.equal(
    buildRateLimitIdentity({
      req: forwardedRequest,
      policy: RATE_LIMIT_POLICIES.exchangeCode,
      trustedProxyMode: 'none',
    }),
    null,
    'missing trusted client IP must disable the anonymous bucket instead of sharing a global key',
  );
  assert.equal(
    buildRateLimitIdentity({
      req: forwardedRequest,
      policy: RATE_LIMIT_POLICIES.exchangeCode,
      trustedProxyMode: 'x-forwarded-for',
    }),
    'ip:203.0.113.10',
  );
  assert.equal(
    buildRateLimitIdentity({
      req: forwardedRequest,
      policy: RATE_LIMIT_POLICIES.pairsCreate,
      userId: 'member-a',
      trustedProxyMode: 'none',
    }),
    'user:member-a',
    'authenticated pair mutations must be isolated per session user',
  );
  assert.equal(
    clientIpFromRequest(
      new Request('https://app.example', {
        headers: { 'x-forwarded-for': 'spoofed-client' },
      }),
      'x-forwarded-for',
    ),
    undefined,
    'trusted mode must still reject malformed forwarded IP values',
  );

  const loginCrossOrigin = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/exchange-code', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    }),
    { protectWithoutSessionCookie: true },
  );
  assert.equal(
    loginCrossOrigin.ok,
    false,
    'OAuth cookie issuance should reject cross-origin requests',
  );

  const bodySchema = z.object({ value: z.string() });
  const validJson = await parseJson(
    new Request('https://app.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ value: 'ok' }),
    }),
    bodySchema,
  );
  assert.ok(validJson.ok, 'bounded application/json should parse');
  if (validJson.ok) assert.deepEqual(validJson.data, { value: 'ok' });

  const unsupportedJson = await parseJson(
    new Request('https://app.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ value: 'ok' }),
    }),
    bodySchema,
  );
  assert.equal(
    unsupportedJson.ok,
    false,
    'non-JSON media types should be rejected',
  );
  if (!unsupportedJson.ok) assert.equal(unsupportedJson.response.status, 415);

  const oversizedJson = await parseJson(
    new Request('https://app.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(MAX_JSON_BODY_BYTES) }),
    }),
    bodySchema,
  );
  assert.equal(
    oversizedJson.ok,
    false,
    'oversized JSON bodies should be rejected',
  );
  if (!oversizedJson.ok) assert.equal(oversizedJson.response.status, 413);

  const privateResponse = jsonOk({ value: 'ok' });
  assert.equal(
    privateResponse.headers.get('cache-control'),
    'private, no-store',
  );
  assert.equal(privateResponse.headers.get('pragma'), 'no-cache');
  assert.equal(privateResponse.headers.get('vary'), 'Cookie, Authorization');

  const clientHttp = readProjectFile('src/client/api/http.ts');
  assert.match(
    clientHttp,
    /let embeddedSessionBearerToken:\s*string \| null = null/,
    'embedded fallback session token should be held only in module memory',
  );
  assert.match(
    clientHttp,
    /isInternalApiPath[\s\S]*\/\.proxy\/api\//,
    'embedded fallback bearer should be sent only to internal API paths',
  );
  assert.doesNotMatch(
    clientHttp,
    /localStorage|sessionStorage/,
    'embedded fallback session token must not be persisted in browser storage',
  );

  const entitlementsGrantRoute = readProjectFile(
    'src/app/api/entitlements/grant/route.ts',
  );
  assert.match(
    entitlementsGrantRoute,
    /timingSafeEqual/,
    'entitlements admin key comparison should use timing-safe comparison',
  );
  assert.match(
    entitlementsGrantRoute,
    /process\.env\.ENTITLEMENTS_ADMIN_KEY\?\.trim\(\)/,
    'entitlements grant should respect the configured admin key in every environment',
  );
  assert.match(
    entitlementsGrantRoute,
    /if \(!configuredKey\) return false/,
    'unkeyed entitlement grants must fail closed in every environment',
  );
  assert.doesNotMatch(
    entitlementsGrantRoute,
    /isLocalRequest|NODE_ENV/,
    'entitlement grant authorization must not trust request host or runtime mode',
  );
  const entitlementAuthorization = entitlementsGrantRoute.indexOf(
    'if (!canGrant(req))',
  );
  const entitlementBodyParse = entitlementsGrantRoute.indexOf(
    'await parseJson(req, bodySchema)',
  );
  const entitlementMutation = entitlementsGrantRoute.indexOf(
    'await entitlementGrantService.grant(',
  );
  assert.ok(
    entitlementAuthorization >= 0,
    'entitlement grant must authorize every request',
  );
  assert.ok(
    entitlementBodyParse > entitlementAuthorization,
    'entitlement grant must reject a missing/wrong admin key before parsing the body',
  );
  assert.ok(
    entitlementMutation > entitlementBodyParse,
    'entitlement grant must authorize and validate before mutating state',
  );
  const previousEntitlementsAdminKey = process.env.ENTITLEMENTS_ADMIN_KEY;
  try {
    const { POST: grantEntitlement } =
      await import('../src/app/api/entitlements/grant/route');
    delete process.env.ENTITLEMENTS_ADMIN_KEY;
    const unconfiguredGrant = await grantEntitlement(
      new NextRequest('http://localhost/api/entitlements/grant', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-entitlements-admin-key': 'attacker-controlled-key',
        },
        body: JSON.stringify({ userId: 'target', plan: 'plus' }),
      }),
    );
    assert.equal(unconfiguredGrant.status, 403);
    assert.match(await unconfiguredGrant.text(), /"code":"ACCESS_DENIED"/);

    process.env.ENTITLEMENTS_ADMIN_KEY =
      'configured-admin-key-at-least-32-chars';
    const wrongKeyGrant = await grantEntitlement(
      new NextRequest('http://localhost/api/entitlements/grant', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-entitlements-admin-key': 'wrong-admin-key',
        },
        body: JSON.stringify({ userId: 'target', plan: 'plus' }),
      }),
    );
    assert.equal(wrongKeyGrant.status, 403);
    assert.match(await wrongKeyGrant.text(), /"code":"ACCESS_DENIED"/);
  } finally {
    if (previousEntitlementsAdminKey === undefined) {
      delete process.env.ENTITLEMENTS_ADMIN_KEY;
    } else {
      process.env.ENTITLEMENTS_ADMIN_KEY = previousEntitlementsAdminKey;
    }
  }

  const resourceGuards = readProjectFile('src/lib/auth/resourceGuards.ts');
  const pairMemberGuard = extractBetween(
    resourceGuards,
    'export const requirePairMember = async (',
    'export const requireActivePairForMember = async (',
  );
  assert.match(
    pairMemberGuard,
    /Pair\.findOne\(\{[\s\S]*_id:\s*guardedObjectId\(pairId\),[\s\S]*members:\s*currentUserId,[\s\S]*status:\s*\{\s*\$in:\s*\['active',\s*'paused'\]\s*}/,
    'pair lookup must scope the database query to the current active/paused member',
  );
  assert.equal(
    countOccurrences(
      pairMemberGuard,
      "jsonNotFound('NOT_FOUND', 'pair not found')",
    ),
    2,
    'invalid/missing/foreign and defensive pair denials must share one 404 envelope',
  );

  const activityMemberGuard = extractBetween(
    resourceGuards,
    'export const requireActivityMember = async (',
    'export const requireLikeParticipant = async (',
  );
  assert.equal(
    countOccurrences(
      activityMemberGuard,
      "jsonNotFound('NOT_FOUND', 'activity not found')",
    ),
    2,
    'invalid/missing/foreign activity denials must share one 404 envelope',
  );
  assert.doesNotMatch(
    activityMemberGuard,
    /return\s+pairGuard/,
    'foreign activity denial must not reveal the linked pair denial message',
  );
  assert.match(
    activityMemberGuard,
    /Pair\.findOne\(\{[\s\S]*_id:\s*activity\?\.pairId\s*\?\?\s*NON_RESOURCE_OBJECT_ID,[\s\S]*members:\s*currentUserId,[\s\S]*status:/,
    'activity denial must execute the same membership-scoped pair lookup for absent and foreign resources',
  );

  const likeParticipantGuard = resourceGuards.slice(
    resourceGuards.indexOf('export const requireLikeParticipant = async ('),
  );
  assert.match(
    likeParticipantGuard,
    /Like\.findOne\(\{[\s\S]*_id:\s*guardedObjectId\(likeId\),[\s\S]*\$or:\s*\[\{\s*fromId:\s*currentUserId\s*},\s*\{\s*toId:\s*currentUserId\s*}\]/,
    'like lookup must scope the database query to the current participant',
  );
  assert.equal(
    countOccurrences(
      likeParticipantGuard,
      "jsonNotFound('NOT_FOUND', 'like not found')",
    ),
    2,
    'invalid/missing/foreign and defensive like denials must share one 404 envelope',
  );
  assert.doesNotMatch(
    resourceGuards,
    /jsonForbidden|ACCESS_DENIED|forbidden/,
    'resource existence guards must not distinguish foreign resources with 403 responses',
  );

  for (const routePath of [
    'src/app/api/activity-templates/route.ts',
    'src/app/api/questionnaires/route.ts',
    'src/app/api/questionnaires/[id]/route.ts',
  ]) {
    const routeSource = readProjectFile(routePath);
    assert.match(
      routeSource,
      /requireSession/,
      `${routePath} should require session auth for closed-beta content`,
    );
    assert.match(
      routeSource,
      /if \(!auth\.ok\) return auth\.response/,
      `${routePath} should return the centralized auth response`,
    );
  }

  const nextConfig = readProjectFile('next.config.ts');
  const proxySource = readProjectFile('src/proxy.ts');
  const rootLayout = readProjectFile('src/app/layout.tsx');
  assert.match(
    nextConfig,
    /X-Content-Type-Options[\s\S]*nosniff/,
    'Next config should send a MIME-sniffing protection header',
  );
  assert.match(
    nextConfig,
    /Referrer-Policy[\s\S]*no-referrer/,
    'Next config should send a strict referrer policy',
  );
  assert.match(
    nextConfig,
    /Permissions-Policy/,
    'Next config should send a restrictive permissions policy',
  );
  assert.doesNotMatch(
    nextConfig,
    /X-Frame-Options/,
    'Discord embedded app should not set X-Frame-Options; use CSP frame-ancestors instead',
  );
  assert.doesNotMatch(
    nextConfig,
    /Content-Security-Policy/,
    'static Next headers must not override the per-request nonce CSP',
  );
  assert.match(proxySource, /'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.match(
    proxySource,
    /frame-ancestors 'self' https:\/\/discord\.com https:\/\/\*\.discord\.com https:\/\/discordapp\.com https:\/\/\*\.discordapp\.com https:\/\/staging\.discord\.co/,
  );
  assert.match(proxySource, /requestHeaders\.set\('Content-Security-Policy'/);
  assert.match(
    proxySource,
    /response\.headers\.set\('Content-Security-Policy'/,
  );
  assert.doesNotMatch(
    proxySource,
    /script-src[^\n]*unsafe-inline/,
    'script execution must stay nonce-restricted',
  );
  assert.match(
    rootLayout,
    /await connection\(\)/,
    'nonce-bearing pages must be dynamically rendered',
  );

  assert.deepEqual(
    {
      code: toDomainError(new Error('E11000 secret collection index')).code,
      message: toDomainError(new Error('E11000 secret collection index'))
        .message,
    },
    { code: 'INTERNAL', message: 'Internal server error' },
    'unexpected infrastructure errors must not be exposed through API envelopes',
  );

  const packageJson = readProjectFile('package.json');
  const tsconfigJson = readProjectFile('tsconfig.json');
  const packageLock = readProjectFile('package-lock.json');
  assert.doesNotMatch(
    packageJson,
    /"next-auth"/,
    'unused next-auth dependency should stay removed',
  );
  assert.doesNotMatch(
    tsconfigJson,
    /next-auth/,
    'tsconfig should not reference removed next-auth types',
  );
  assert.doesNotMatch(
    packageLock,
    /node_modules\/next-auth/,
    'package-lock should not include the removed next-auth dependency',
  );

  for (const activeMatchRoute of [
    'accept/route.ts',
    'card/route.ts',
    'card/[id]/route.ts',
    'confirm/route.ts',
    'feed/route.ts',
    'inbox/route.ts',
    'like/route.ts',
    'like/[id]/route.ts',
    'reject/route.ts',
    'respond/route.ts',
  ]) {
    assert.equal(
      existsSync(
        new URL(`../src/app/api/match/${activeMatchRoute}`, import.meta.url),
      ),
      true,
      `authenticated matching route must be present: ${activeMatchRoute}`,
    );
  }

  const auditEventTypes = readProjectFile('src/lib/audit/eventTypes.ts');
  const auditBlocks = [
    extractBetween(
      auditEventTypes,
      'QUESTIONNAIRE_ANSWERED:',
      'ANSWERS_BULK_SUBMITTED:',
    ),
    extractBetween(
      auditEventTypes,
      'ANSWERS_BULK_SUBMITTED:',
      'USER_ONBOARDING_UPDATED:',
    ),
    extractBetween(
      auditEventTypes,
      'ACTIVITY_CHECKED_IN:',
      'ACTIVITY_COMPLETED:',
    ),
    extractBetween(
      auditEventTypes,
      'WEEKLY_CHECKIN_SUBMITTED:',
      'SAFETY_GATE_UPDATED:',
    ),
  ];
  for (const forbiddenField of [
    'confidence',
    'sumWeightsTotal',
    'deltaMagnitude',
    'appliedStepByAxis',
    'clampedAxes',
  ]) {
    for (const block of auditBlocks) {
      assert.doesNotMatch(
        block,
        new RegExp(`\\b${forbiddenField}\\b`),
        `${forbiddenField} must not be part of questionnaire/check-in audit metadata`,
      );
    }
  }

  const questionnaireService = readProjectFile(
    'src/domain/services/questionnaires.service.ts',
  );
  assert.doesNotMatch(questionnaireService, /toVectorAuditMetrics|vectorAudit/);
  assert.match(
    questionnaireService,
    /answersCount:\s*canonicalAnswers\.length/,
  );
  assert.match(questionnaireService, /semanticStatus:\s*'UNMAPPED'/);
  assert.doesNotMatch(
    extractBetween(
      questionnaireService,
      "event: 'ANSWERS_BULK_SUBMITTED'",
      'return {};',
    ),
    /\bui\b/,
    'personal questionnaire audit must not persist raw answer values',
  );

  const auditEmitter = readProjectFile('src/lib/audit/emitEvent.ts');
  for (const blockedAuditKey of [
    'confidence',
    'sumweightstotal',
    'deltamagnitude',
    'appliedstepbyaxis',
    'clampedaxes',
    'matchscore',
  ]) {
    assert.match(
      auditEmitter,
      new RegExp(`'${blockedAuditKey}'`),
      `${blockedAuditKey} should be removed by the audit metadata sanitizer`,
    );
  }
  assert.match(
    auditEmitter,
    /input\.eventKey[\s\S]*EventLog\.findOneAndUpdate\([\s\S]*\$setOnInsert[\s\S]*upsert: true/,
    'stable audit event identities must use an idempotent upsert for crash/retry delivery',
  );

  assert.equal(
    existsSync(
      new URL('../src/app/api/answers/bulk/route.ts', import.meta.url),
    ),
    false,
    'legacy bulk-answer route must stay removed',
  );
  assert.match(
    readProjectFile('src/app/api/questionnaires/[id]/route.ts'),
    /\.min\(1\)\s*\.max\(100\)/,
    'questionnaire answers should cap request array length',
  );
  assert.match(
    readProjectFile('src/app/api/activities/[id]/checkin/route.ts'),
    /\.min\(1\)\s*\.max\(20\)/,
    'activity check-in answers should cap request array length',
  );

  for (const routePath of [
    'src/app/api/pairs/[id]/recommendations/route.ts',
    'src/app/api/pairs/[id]/activities/suggest/route.ts',
    'src/app/api/pairs/[id]/suggest/route.ts',
    'src/app/api/pairs/[id]/activities/from-template/route.ts',
  ]) {
    const pairRoute = readProjectFile(routePath);
    const guardCall = pairRoute.indexOf('await requirePairMember(');
    const genericDenial = pairRoute.indexOf(
      "'RECOMMENDATION_UNAVAILABLE'",
      guardCall,
    );
    const rateLimit = pairRoute.indexOf(
      'await enforceRateLimit(',
      genericDenial,
    );
    const idempotency = pairRoute.indexOf('withIdempotency({', rateLimit);
    assert.ok(
      guardCall >= 0,
      `${routePath} must call the central pair member guard`,
    );
    assert.ok(
      genericDenial > guardCall,
      `${routePath} must map pair denial to the generic recommendation error`,
    );
    assert.ok(
      rateLimit > genericDenial,
      `${routePath} must deny nonmembers before rate or entitlement work`,
    );
    assert.ok(
      idempotency > rateLimit,
      `${routePath} must be idempotent after rate limiting`,
    );
    assert.match(pairRoute, /RATE_LIMIT_POLICIES\.recommendationMutations/);
    assert.doesNotMatch(
      pairRoute,
      /assertRecommendationOfferAccess|resolveEntitlements|assertEntitlement|assertQuota|ENTITLEMENT_REQUIRED/,
      `${routePath} must remain free of billing and entitlement gates`,
    );
  }
  const canonicalRecommendationMutation = readProjectFile(
    'src/app/api/pairs/[id]/recommendations/mutation.ts',
  );
  assert.doesNotMatch(
    canonicalRecommendationMutation,
    /assertRecommendationOfferAccess|resolveEntitlements|assertEntitlement|assertQuota/,
    'canonical recommendation offer and replacement must remain free of plan gates',
  );
  assert.match(
    readProjectFile('src/app/api/pairs/[id]/recommendations/route.ts'),
    /RATE_LIMIT_POLICIES\.recommendationMutations/,
    'canonical recommendations must retain plan-independent abuse rate limiting',
  );

  const nextRecommendationRoute = readProjectFile(
    'src/app/api/activities/next/route.ts',
  );
  const activePairGuard = nextRecommendationRoute.indexOf(
    'await requireActivePairForMember(',
  );
  const nextRateLimit = nextRecommendationRoute.indexOf(
    'await enforceRateLimit(',
    activePairGuard,
  );
  const nextIdempotency = nextRecommendationRoute.indexOf(
    'withIdempotency({',
    nextRateLimit,
  );
  assert.ok(activePairGuard >= 0);
  assert.ok(nextRateLimit > activePairGuard);
  assert.ok(nextIdempotency > nextRateLimit);
  assert.doesNotMatch(
    nextRecommendationRoute,
    /assertRecommendationOfferAccess|resolveEntitlements|assertEntitlement|assertQuota|ENTITLEMENT_REQUIRED/,
    'compatibility recommendation endpoint must remain free of billing gates',
  );

  for (const routePath of ['src/app/api/pairs/create/route.ts']) {
    assert.doesNotMatch(
      readProjectFile(routePath),
      /resolveEntitlements|assertEntitlement|assertQuota|ENTITLEMENT_REQUIRED/,
      `${routePath} must not expose a paid runtime boundary`,
    );
  }

  assert.doesNotMatch(
    readProjectFile('src/app/api/pairs/[id]/summary/route.ts'),
    /console\.(log|warn|error)|requestedPairId|foundPairId|membershipOk/,
    'pair summary denial must not log direct user or pair identifiers',
  );

  const agentChecks = extractBetween(
    readProjectFile('scripts/agent-checks.ts'),
    'const privateMutationWithoutSession',
    'const rules',
  );
  assert.doesNotMatch(
    agentChecks,
    /verify\[A-Za-z0-9\]\*Webhook/,
    'generic verify*Webhook names must not bypass missing-session checks',
  );
  assert.match(agentChecks, /billing\/webhooks\/sandbox\/route\.ts/);
  assert.match(agentChecks, /verifySandboxWebhook/);
  assert.equal(
    existsSync(
      new URL(
        '../src/app/api/pairs/[id]/diagnostics/route.ts',
        import.meta.url,
      ),
    ),
    false,
    'legacy diagnostics API must be absent from the runtime',
  );
  assert.equal(
    existsSync(
      new URL('../src/app/pair/[id]/diagnostics/page.tsx', import.meta.url),
    ),
    false,
    'legacy diagnostics UI must be absent from the runtime',
  );

  console.log('Security critical self-check passed.');
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
