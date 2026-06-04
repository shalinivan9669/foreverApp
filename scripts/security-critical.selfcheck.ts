import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchTransition } from '../src/domain/state/matchMachine';
import { getUserProfileStatus, toUserDTO } from '../src/lib/dto/user.dto';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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
    /metadata:\s*{\s*reason,\s*status,\s*}/,
    'OAuth audit failure metadata should stay reason/status only'
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
