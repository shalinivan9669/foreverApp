import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { matchTransition } from '../src/domain/state/matchMachine';
import { toDomainError } from '../src/domain/errors';
import { getUserProfileStatus, toUserDTO } from '../src/lib/dto/user.dto';
import { toMatchFeedCandidateDTO } from '../src/lib/dto/match.dto';
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
import { resolveDuplicateReplay } from '../src/lib/idempotency/withIdempotency';
import { projectLegacyMatchLikeResponse } from '../src/app/api/match/like/projectResponse';

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

const run = async () => {
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
    /session_token:\s*embeddedSessionToken/,
    'exchange-code should return a signed in-memory fallback session token for embedded mobile clients'
  );
  assert.match(
    exchangeCodeRoute,
    /requireTrustedUnsafeRequest\(req,[\s\S]*protectWithoutSessionCookie:\s*true/,
    'exchange-code should reject cross-origin login requests before setting a session cookie'
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
  assert.match(
    appPage,
    /Откройте приложение внутри Discord и повторите попытку/,
    'client OAuth failure should explain the embedded re-auth action in readable Russian'
  );
  assert.match(
    appPage,
    /onClick=\{\(\) => void connectDiscord\(\)\}[\s\S]*Повторить подключение/,
    'client OAuth failure should provide an explicit retry action'
  );

  const sessionAuth = readProjectFile('src/lib/auth/session.ts');
  assert.match(
    sessionAuth,
    /getBearerToken[\s\S]*authorization[\s\S]*bearer/,
    'session auth should support Authorization bearer fallback for embedded mobile clients'
  );
  assert.match(
    sessionAuth,
    /cookieToken[\s\S]*verifyJwt\(cookieToken,\s*secret\)[\s\S]*bearerToken[\s\S]*verifyJwt\(bearerToken,\s*secret\)/,
    'session auth should verify both cookie and bearer sessions with JWT_SECRET'
  );

  const authGuards = readProjectFile('src/lib/auth/guards.ts');
  assert.match(
    authGuards,
    /requireTrustedUnsafeRequest\(req\)/,
    'cookie-authenticated mutations should pass through the centralized request-origin guard'
  );

  const sameOriginMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: {
        cookie: 'session=test-token',
        origin: 'https://app.example',
        'sec-fetch-site': 'same-origin',
      },
    })
  );
  assert.equal(sameOriginMutation.ok, true, 'same-origin cookie mutation should be accepted');

  const crossOriginMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: {
        cookie: 'session=test-token',
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    })
  );
  assert.equal(crossOriginMutation.ok, false, 'cross-origin cookie mutation should be rejected');
  if (!crossOriginMutation.ok) {
    assert.equal(crossOriginMutation.response.status, 403);
    const payload = await crossOriginMutation.response.clone().json() as {
      error?: { code?: string };
    };
    assert.equal(payload.error?.code, 'REQUEST_ORIGIN_DENIED');
  }

  const missingOriginMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: { cookie: 'session=test-token' },
    })
  );
  assert.equal(
    missingOriginMutation.ok,
    false,
    'cookie mutation should fail closed without Origin or same-origin Fetch Metadata'
  );

  const bearerOnlyMutation = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/match/like', {
      method: 'POST',
      headers: {
        authorization: 'Bearer embedded-session',
        origin: 'https://embedded.example',
        'sec-fetch-site': 'cross-site',
      },
    })
  );
  assert.equal(
    bearerOnlyMutation.ok,
    true,
    'bearer-only embedded clients should not be subjected to cookie-CSRF checks'
  );

  const forwardedRequest = new Request('https://app.example/api/exchange-code', {
    headers: {
      'x-forwarded-for': '203.0.113.10, 10.0.0.2',
      'x-real-ip': '203.0.113.11',
      'cf-connecting-ip': '203.0.113.12',
    },
  });
  const previousTrustedProxyMode = process.env.TRUSTED_PROXY_MODE;
  delete process.env.TRUSTED_PROXY_MODE;
  try {
    assert.equal(
      clientIpFromRequest(forwardedRequest),
      undefined,
      'raw forwarding headers must be ignored by default'
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
    '203.0.113.10'
  );
  assert.equal(
    buildRateLimitIdentity({
      req: forwardedRequest,
      policy: RATE_LIMIT_POLICIES.exchangeCode,
      trustedProxyMode: 'none',
    }),
    null,
    'missing trusted client IP must disable the anonymous bucket instead of sharing a global key'
  );
  assert.equal(
    buildRateLimitIdentity({
      req: forwardedRequest,
      policy: RATE_LIMIT_POLICIES.exchangeCode,
      trustedProxyMode: 'x-forwarded-for',
    }),
    'ip:203.0.113.10'
  );
  assert.equal(
    buildRateLimitIdentity({
      req: forwardedRequest,
      policy: RATE_LIMIT_POLICIES.pairsCreate,
      userId: 'member-a',
      trustedProxyMode: 'none',
    }),
    'user:member-a',
    'authenticated pair mutations must be isolated per session user'
  );
  assert.equal(
    clientIpFromRequest(
      new Request('https://app.example', {
        headers: { 'x-forwarded-for': 'spoofed-client' },
      }),
      'x-forwarded-for'
    ),
    undefined,
    'trusted mode must still reject malformed forwarded IP values'
  );

  const loginCrossOrigin = requireTrustedUnsafeRequest(
    new Request('https://app.example/api/exchange-code', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    }),
    { protectWithoutSessionCookie: true }
  );
  assert.equal(loginCrossOrigin.ok, false, 'OAuth cookie issuance should reject cross-origin requests');

  const bodySchema = z.object({ value: z.string() });
  const validJson = await parseJson(
    new Request('https://app.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ value: 'ok' }),
    }),
    bodySchema
  );
  assert.ok(validJson.ok, 'bounded application/json should parse');
  if (validJson.ok) assert.deepEqual(validJson.data, { value: 'ok' });

  const unsupportedJson = await parseJson(
    new Request('https://app.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ value: 'ok' }),
    }),
    bodySchema
  );
  assert.equal(unsupportedJson.ok, false, 'non-JSON media types should be rejected');
  if (!unsupportedJson.ok) assert.equal(unsupportedJson.response.status, 415);

  const oversizedJson = await parseJson(
    new Request('https://app.example/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(MAX_JSON_BODY_BYTES) }),
    }),
    bodySchema
  );
  assert.equal(oversizedJson.ok, false, 'oversized JSON bodies should be rejected');
  if (!oversizedJson.ok) assert.equal(oversizedJson.response.status, 413);

  const privateResponse = jsonOk({ value: 'ok' });
  assert.equal(privateResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(privateResponse.headers.get('pragma'), 'no-cache');
  assert.equal(privateResponse.headers.get('vary'), 'Cookie, Authorization');

  const clientHttp = readProjectFile('src/client/api/http.ts');
  assert.match(
    clientHttp,
    /let embeddedSessionBearerToken:\s*string \| null = null/,
    'embedded fallback session token should be held only in module memory'
  );
  assert.match(
    clientHttp,
    /isInternalApiPath[\s\S]*\/\.proxy\/api\//,
    'embedded fallback bearer should be sent only to internal API paths'
  );
  assert.doesNotMatch(
    clientHttp,
    /localStorage|sessionStorage/,
    'embedded fallback session token must not be persisted in browser storage'
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
  const proxySource = readProjectFile('src/proxy.ts');
  const rootLayout = readProjectFile('src/app/layout.tsx');
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
  assert.doesNotMatch(
    nextConfig,
    /Content-Security-Policy/,
    'static Next headers must not override the per-request nonce CSP'
  );
  assert.match(proxySource, /'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.match(
    proxySource,
    /frame-ancestors 'self' https:\/\/discord\.com https:\/\/\*\.discord\.com https:\/\/discordapp\.com https:\/\/\*\.discordapp\.com https:\/\/staging\.discord\.co/
  );
  assert.match(proxySource, /requestHeaders\.set\('Content-Security-Policy'/);
  assert.match(proxySource, /response\.headers\.set\('Content-Security-Policy'/);
  assert.doesNotMatch(
    proxySource,
    /script-src[^\n]*unsafe-inline/,
    'script execution must stay nonce-restricted'
  );
  assert.match(
    rootLayout,
    /await connection\(\)/,
    'nonce-bearing pages must be dynamically rendered'
  );

  assert.deepEqual(
    {
      code: toDomainError(new Error('E11000 secret collection index')).code,
      message: toDomainError(new Error('E11000 secret collection index')).message,
    },
    { code: 'INTERNAL', message: 'Internal server error' },
    'unexpected infrastructure errors must not be exposed through API envelopes'
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
    /calculateMatchScore|readAxisLayer|distance\(|score\(/,
    'match creation must not compute an exact score from private participant vectors'
  );
  assert.match(
    matchService,
    /matchScore:\s*LEGACY_MATCH_SCORE_SENTINEL/,
    'legacy matchScore should remain a non-sensitive compatibility sentinel'
  );
  assert.match(
    matchService,
    /matchScoreAvailable:\s*LEGACY_MATCH_SCORE_AVAILABLE/,
    'match creation response should mark the legacy score unavailable'
  );

  const candidateDto = toMatchFeedCandidateDTO({
    id: 'candidate-a',
    username: 'candidate',
    avatar: 'avatar',
  });
  assert.equal(candidateDto.score, 0);
  assert.equal(candidateDto.scoreAvailable, false);

  const legacyStoredReplay = resolveDuplicateReplay({
    requestHash: 'legacy-request-hash',
    existing: {
      requestHash: 'legacy-request-hash',
      state: 'completed',
      status: 200,
      responseEnvelope: {
        ok: true,
        data: {
          id: 'legacy-like-id',
          matchScore: 87,
        },
      },
    },
  });
  const projectedLegacyReplay = await projectLegacyMatchLikeResponse(legacyStoredReplay);
  const projectedLegacyPayload = await projectedLegacyReplay.json() as {
    data?: {
      id?: string;
      matchScore?: number;
      matchScoreAvailable?: boolean;
    };
  };
  assert.deepEqual(projectedLegacyPayload.data, {
    id: 'legacy-like-id',
    matchScore: 0,
    matchScoreAvailable: false,
  });
  assert.doesNotMatch(
    JSON.stringify(projectedLegacyPayload),
    /87/,
    'historical idempotency replay must not expose the stored exact match score'
  );

  const matchLikeRoute = readProjectFile('src/app/api/match/like/route.ts');
  assert.match(
    matchLikeRoute,
    /projectLegacyMatchLikeResponse\(response\)/,
    'fresh and replayed create-like responses should pass through the legacy score projection'
  );

  const matchFeedRoute = readProjectFile('src/app/api/match/feed/route.ts');
  assert.doesNotMatch(
    matchFeedRoute,
    /\bvectors\b|calcMatch|candidateScore|pickVec|\.score\s*-/,
    'match feed must not query, calculate, or rank by private vectors'
  );
  assert.match(matchFeedRoute, /\.sort\(\{ _id: 1 \}\)[\s\S]*\.limit\(50\)/);

  const matchInboxRoute = readProjectFile('src/app/api/match/inbox/route.ts');
  assert.doesNotMatch(matchInboxRoute, /l\.matchScore/);
  assert.match(matchInboxRoute, /matchScoreAvailable:\s*LEGACY_MATCH_SCORE_AVAILABLE/);

  const matchLikeDetailRoute = readProjectFile('src/app/api/match/like/[id]/route.ts');
  assert.doesNotMatch(matchLikeDetailRoute, /like\.matchScore/);

  const matchDtoSource = readProjectFile('src/lib/dto/match.dto.ts');
  assert.doesNotMatch(matchDtoSource, /matchScore:\s*like\.matchScore/);
  assert.match(matchDtoSource, /scoreAvailable:\s*LEGACY_MATCH_SCORE_AVAILABLE/);
  assert.match(matchDtoSource, /matchScoreAvailable:\s*LEGACY_MATCH_SCORE_AVAILABLE/);

  for (const [path, forbiddenPattern] of [
    ['src/components/CandidateCard.tsx', /c\.score|toFixed\(/],
    ['src/features/match/inbox/MatchInboxView.tsx', /row\.matchScore/],
    ['src/features/match/like/LikeDetailsView.tsx', /like\.matchScore/],
    ['src/components/LikeModal.tsx', /created\.matchScore/],
  ] as const) {
    assert.doesNotMatch(
      readProjectFile(path),
      forbiddenPattern,
      `${path} must not display or propagate a legacy exact match percentage`
    );
  }

  const auditEventTypes = readProjectFile('src/lib/audit/eventTypes.ts');
  const auditBlocks = [
    extractBetween(auditEventTypes, 'QUESTIONNAIRE_ANSWERED:', 'ANSWERS_BULK_SUBMITTED:'),
    extractBetween(auditEventTypes, 'ANSWERS_BULK_SUBMITTED:', 'USER_ONBOARDING_UPDATED:'),
    extractBetween(auditEventTypes, 'ACTIVITY_CHECKED_IN:', 'ACTIVITY_COMPLETED:'),
    extractBetween(auditEventTypes, 'WEEKLY_CHECKIN_SUBMITTED:', 'SAFETY_GATE_UPDATED:'),
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
        `${forbiddenField} must not be part of questionnaire/check-in audit metadata`
      );
    }
  }

  const questionnaireService = readProjectFile('src/domain/services/questionnaires.service.ts');
  assert.doesNotMatch(questionnaireService, /toVectorAuditMetrics|vectorAudit/);
  assert.match(questionnaireService, /toQuestionnaireAuditCounts/);

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
      `${blockedAuditKey} should be removed by the audit metadata sanitizer`
    );
  }

  assert.match(
    readProjectFile('src/app/api/answers/bulk/route.ts'),
    /\.min\(1\)\s*\.max\(100\)/,
    'bulk answers should cap request array length'
  );
  assert.match(
    readProjectFile('src/app/api/questionnaires/[id]/route.ts'),
    /\.min\(1\)\s*\.max\(100\)/,
    'questionnaire answers should cap request array length'
  );
  assert.match(
    readProjectFile('src/app/api/activities/[id]/checkin/route.ts'),
    /\.min\(1\)\s*\.max\(20\)/,
    'activity check-in answers should cap request array length'
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
      guardCall
    );
    const rateLimit = pairRoute.indexOf('await enforceRateLimit(', genericDenial);
    const idempotency = pairRoute.indexOf('withIdempotency({', rateLimit);
    assert.ok(guardCall >= 0, `${routePath} must call the central pair member guard`);
    assert.ok(
      genericDenial > guardCall,
      `${routePath} must map pair denial to the generic recommendation error`
    );
    assert.ok(
      rateLimit > genericDenial,
      `${routePath} must deny nonmembers before rate or entitlement work`
    );
    assert.ok(idempotency > rateLimit, `${routePath} must be idempotent after rate limiting`);
    assert.match(pairRoute, /RATE_LIMIT_POLICIES\.recommendationMutations/);
  }

  const recommendationAccess = readProjectFile(
    'src/lib/entitlements/recommendationAccess.ts'
  );
  assert.match(recommendationAccess, /resolveEntitlements\(/);
  assert.match(recommendationAccess, /assertEntitlement\(/);
  assert.match(recommendationAccess, /assertQuota\(/);
  for (const routePath of [
    'src/app/api/pairs/[id]/activities/suggest/route.ts',
    'src/app/api/pairs/[id]/suggest/route.ts',
    'src/app/api/pairs/[id]/activities/from-template/route.ts',
  ]) {
    assert.match(readProjectFile(routePath), /assertRecommendationOfferAccess\(/);
  }
  const canonicalRecommendationMutation = readProjectFile(
    'src/app/api/pairs/[id]/recommendations/mutation.ts'
  );
  assert.match(canonicalRecommendationMutation, /assertRecommendationOfferAccess\(/);

  const nextRecommendationRoute = readProjectFile('src/app/api/activities/next/route.ts');
  const activePairGuard = nextRecommendationRoute.indexOf(
    'await requireActivePairForMember('
  );
  const nextRateLimit = nextRecommendationRoute.indexOf(
    'await enforceRateLimit(',
    activePairGuard
  );
  const nextIdempotency = nextRecommendationRoute.indexOf(
    'withIdempotency({',
    nextRateLimit
  );
  assert.ok(activePairGuard >= 0);
  assert.ok(nextRateLimit > activePairGuard);
  assert.ok(nextIdempotency > nextRateLimit);
  assert.match(nextRecommendationRoute, /assertRecommendationOfferAccess\(/);

  assert.doesNotMatch(
    readProjectFile('src/app/api/pairs/[id]/summary/route.ts'),
    /console\.(log|warn|error)|requestedPairId|foundPairId|membershipOk/,
    'pair summary denial must not log direct user or pair identifiers'
  );

  const agentChecks = extractBetween(
    readProjectFile('scripts/agent-checks.ts'),
    'const privateMutationWithoutSession',
    'const rules'
  );
  assert.doesNotMatch(
    agentChecks,
    /verify\[A-Za-z0-9\]\*Webhook/,
    'generic verify*Webhook names must not bypass missing-session checks'
  );
  assert.match(agentChecks, /billing\/webhooks\/sandbox\/route\.ts/);
  assert.match(agentChecks, /verifySandboxWebhook/);
  const confirmStart = matchService.indexOf('async confirmLike');
  const confirmSection = matchService.slice(confirmStart);
  assert.ok(confirmStart >= 0, 'confirmLike service boundary should remain explicit');
  assert.match(
    confirmSection,
    /ensureLikeParticipant[\s\S]*code:\s*'PAIR_INVITE_REQUIRED'/,
    'legacy match confirmation must require the invite-only pair flow'
  );
  assert.doesNotMatch(
    confirmSection,
    /Pair\.(create|findOneAndUpdate|updateOne)/,
    'legacy match confirmation must not create or activate a Pair'
  );

  const diagnosticsRoute = readProjectFile('src/app/api/pairs/[id]/diagnostics/route.ts');
  assert.match(diagnosticsRoute, /requireSession\(req\)/);
  assert.match(diagnosticsRoute, /requirePairMember\(id, currentUserId\)/);
  assert.match(diagnosticsRoute, /PAIR_DIAGNOSTICS_RETIRED/);
  assert.match(diagnosticsRoute, /Cache-Control', 'private, no-store/);
  assert.doesNotMatch(
    diagnosticsRoute,
    /buildPairAnswerDiagnostics|pairAnswerSignals|generatedInsightIds|pair\.fatigue|pair\.readiness/,
    'legacy diagnostics endpoint must not compute or expose reconstructable pair metrics'
  );
  const diagnosticsPage = readProjectFile('src/app/pair/[id]/diagnostics/page.tsx');
  assert.doesNotMatch(diagnosticsPage, /getDiagnostics|PairPassportDTO|InsightsList/);
  assert.match(diagnosticsPage, /Открыть Pair Summary/);

  console.log('Security critical self-check passed.');
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
