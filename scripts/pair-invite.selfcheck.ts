import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DomainError } from '@/domain/errors';
import { pairInviteTransition } from '@/domain/state/pairInviteMachine';
import {
  generatePairInviteToken,
  hashPairInviteToken,
  PAIR_INVITE_TOKEN_BYTES,
  PAIR_INVITE_TTL_MS,
} from '@/domain/services/pairInvite.service';

const source = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

assert.equal(PAIR_INVITE_TOKEN_BYTES, 32);
assert.equal(PAIR_INVITE_TTL_MS, 72 * 60 * 60 * 1000);

const firstToken = generatePairInviteToken();
const secondToken = generatePairInviteToken();
assert.match(firstToken, /^[A-Za-z0-9_-]{43}$/);
assert.match(secondToken, /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(firstToken, secondToken);
const firstHash = hashPairInviteToken(firstToken);
assert.match(firstHash, /^[a-f0-9]{64}$/);
assert.notEqual(firstHash, firstToken);
assert.equal(hashPairInviteToken(firstToken), firstHash);

const now = new Date('2026-08-07T00:00:00.000Z');
const activeInvite = {
  creatorUserId: 'creator',
  status: 'ACTIVE' as const,
};
assert.deepEqual(
  pairInviteTransition(activeInvite, { type: 'CANCEL' }, { currentUserId: 'creator', now })
    .next,
  { status: 'CANCELLED' }
);
assert.deepEqual(
  pairInviteTransition(activeInvite, { type: 'EXPIRE' }, { currentUserId: 'system', now })
    .next,
  { status: 'EXPIRED' }
);
const accepted = pairInviteTransition(
  activeInvite,
  { type: 'ACCEPT' },
  { currentUserId: 'member-b', now }
);
assert.equal(accepted.next.status, 'ACCEPTED');
assert.equal(accepted.next.acceptedByUserId, 'member-b');
assert.equal(accepted.reason, 'INVITE_ACCEPTED');
assert.equal(
  pairInviteTransition(
    {
      creatorUserId: 'creator',
      status: 'ACCEPTED',
      acceptedByUserId: 'member-b',
    },
    { type: 'ACCEPT' },
    { currentUserId: 'member-b', now }
  ).reason,
  'INVITE_ACCEPT_NOOP'
);
assert.equal(
  pairInviteTransition(
    { creatorUserId: 'creator', status: 'EXPIRED' },
    { type: 'REISSUE' },
    { currentUserId: 'creator', now }
  ).reason,
  'INVITE_REISSUED'
);

const unavailableErrors = [
  () =>
    pairInviteTransition(activeInvite, { type: 'ACCEPT' }, { currentUserId: 'creator', now }),
  () =>
    pairInviteTransition(
      { creatorUserId: 'creator', status: 'CANCELLED' },
      { type: 'ACCEPT' },
      { currentUserId: 'member-b', now }
    ),
  () =>
    pairInviteTransition(
      { creatorUserId: 'creator', status: 'EXPIRED' },
      { type: 'ACCEPT' },
      { currentUserId: 'member-b', now }
    ),
  () =>
    pairInviteTransition(
      {
        creatorUserId: 'creator',
        status: 'ACCEPTED',
        acceptedByUserId: 'member-c',
      },
      { type: 'ACCEPT' },
      { currentUserId: 'member-b', now }
    ),
];
for (const operation of unavailableErrors) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, 'PAIR_INVITE_UNAVAILABLE');
    assert.equal(error.status, 409);
    assert.equal(error.message, 'Pair invite is unavailable');
    assert.equal(error.details, undefined);
    return true;
  });
}

const inviteModel = source('src/models/PairInvite.ts');
assert.ok(inviteModel.includes('tokenHash'));
assert.ok(!inviteModel.includes('token: {'));
assert.ok(inviteModel.includes("'ACTIVE'"));
assert.ok(inviteModel.includes("'ACCEPTED'"));
assert.ok(inviteModel.includes("'CANCELLED'"));
assert.ok(inviteModel.includes("'EXPIRED'"));
assert.ok(inviteModel.includes("partialFilterExpression: { status: 'ACTIVE' }"));
assert.ok(!inviteModel.includes('expireAfterSeconds'));

const claimModel = source('src/models/PairMembershipClaim.ts');
assert.ok(claimModel.includes("{ userId: 1 }"));
assert.ok(claimModel.includes('unique: true'));
assert.ok(claimModel.includes('one_pair_membership_claim_per_user'));

const service = source('src/domain/services/pairInvite.service.ts');
assert.ok(service.includes('randomBytes(PAIR_INVITE_TOKEN_BYTES)'));
assert.ok(service.includes("createHash('sha256')"));
assert.ok(service.includes('PAIR_INVITE_TTL_MS = 72 * 60 * 60 * 1000'));
assert.ok(service.includes("status: { $in: ACTIVE_PAIR_STATUSES }"));
assert.ok(service.includes('mongoose.startSession()'));
assert.ok(service.includes('session.withTransaction'));
assert.ok(service.includes('PairMembershipClaim.insertMany'));
assert.ok(service.includes("source: 'pair_invite_accept'"));
assert.ok(!service.includes('console.log'));
assert.ok(!service.includes('console.warn'));
assert.ok(!service.includes('metadata: { token'));
assert.ok(!service.includes('metadata: {\n          token'));
const ownerDtoBlock = service.slice(
  service.indexOf('export type PairInviteOwnerDTO'),
  service.indexOf('export type PairInviteIssueDTO')
);
assert.ok(!ownerDtoBlock.includes('tokenHash'));
assert.ok(!ownerDtoBlock.includes('creatorUserId'));
assert.ok(!ownerDtoBlock.includes('acceptedByUserId'));
const acceptMethodIndex = service.indexOf('async accept(input:');
const activePairPreflightIndex = service.indexOf(
  'if (await activePairForAnyMember(members))',
  acceptMethodIndex
);
const claimInsertIndex = service.indexOf('PairMembershipClaim.insertMany', acceptMethodIndex);
const pairCreateIndex = service.indexOf('Pair.create(', acceptMethodIndex);
const acceptedUpdateIndex = service.indexOf("status: transition.next.status", pairCreateIndex);
const auditIndex = service.indexOf("event: 'PAIR_CREATED'", acceptedUpdateIndex);
assert.ok(acceptMethodIndex >= 0);
assert.ok(activePairPreflightIndex > acceptMethodIndex);
assert.ok(activePairPreflightIndex < claimInsertIndex);
assert.ok(claimInsertIndex > acceptMethodIndex);
assert.ok(pairCreateIndex > claimInsertIndex);
assert.ok(acceptedUpdateIndex > pairCreateIndex);
assert.ok(auditIndex > acceptedUpdateIndex);
const auditBlock = service.slice(auditIndex, service.indexOf('return {', auditIndex));
assert.ok(!auditBlock.includes('token'));
assert.ok(!auditBlock.includes('inviteId'));

const routePaths = [
  'src/app/api/pair-invites/route.ts',
  'src/app/api/pair-invites/[id]/route.ts',
  'src/app/api/pair-invites/[id]/cancel/route.ts',
  'src/app/api/pair-invites/[id]/reissue/route.ts',
  'src/app/api/pair-invites/resolve/route.ts',
  'src/app/api/pair-invites/accept/route.ts',
];
for (const routePath of routePaths) {
  const route = source(routePath);
  assert.ok(route.includes('requireSession(req)'), `${routePath} must require session`);
  assert.ok(route.includes('enforceRateLimit'), `${routePath} must enforce rate limit`);
  assert.ok(!route.includes('body.userId'), `${routePath} must not trust body.userId`);
}

const createRoute = source('src/app/api/pair-invites/route.ts');
const reissueRoute = source('src/app/api/pair-invites/[id]/reissue/route.ts');
assert.ok(createRoute.includes('export async function GET'));
assert.ok(createRoute.includes('pairInviteService.ownerCurrent'));
assert.ok(createRoute.includes("Cache-Control', 'no-store"));
assert.ok(reissueRoute.includes("Cache-Control', 'no-store"));
assert.ok(!createRoute.includes('withIdempotency'));
assert.ok(!reissueRoute.includes('withIdempotency'));
assert.ok(!createRoute.includes('tokenHash'));

const resolveRoute = source('src/app/api/pair-invites/resolve/route.ts');
const acceptRoute = source('src/app/api/pair-invites/accept/route.ts');
assert.ok(resolveRoute.includes('body.data.token'));
assert.ok(!resolveRoute.includes('searchParams'));
assert.ok(acceptRoute.includes('body.data.token'));
assert.ok(!acceptRoute.includes('searchParams'));
assert.ok(acceptRoute.includes('withIdempotency'));
assert.ok(acceptRoute.includes('requestBody: { tokenHash:'));
assert.ok(!acceptRoute.includes('requestBody: { token:'));

const legacyPairService = source('src/domain/services/pairs.service.ts');
assert.ok(legacyPairService.includes("code: 'PAIR_INVITE_REQUIRED'"));
const createPairSection = legacyPairService.slice(
  legacyPairService.indexOf('async createPair'),
  legacyPairService.indexOf('async pausePair')
);
assert.doesNotMatch(createPairSection, /Pair\.(create|findOneAndUpdate|updateOne)/);
const legacyMatchService = source('src/domain/services/match.service.ts');
const confirmSection = legacyMatchService.slice(legacyMatchService.indexOf('async confirmLike'));
assert.ok(confirmSection.includes("code: 'PAIR_INVITE_REQUIRED'"));
assert.doesNotMatch(confirmSection, /Pair\.(create|findOneAndUpdate|updateOne)/);

const auditTypes = source('src/lib/audit/eventTypes.ts');
assert.ok(auditTypes.includes("'pair_invite_accept'"));

const inviteClient = source('src/client/api/pairInvites.api.ts');
const joinPage = source('src/app/join/page.tsx');
assert.ok(inviteClient.includes("availability: 'available' | 'accepted' | 'unavailable'"));
const createClientBlock = inviteClient.slice(
  inviteClient.indexOf('create: async'),
  inviteClient.indexOf('cancel: async')
);
const reissueClientBlock = inviteClient.slice(
  inviteClient.indexOf('reissue: async'),
  inviteClient.indexOf('resolve: async')
);
assert.doesNotMatch(createClientBlock, /idempotency:\s*true/);
assert.doesNotMatch(reissueClientBlock, /idempotency:\s*true/);
assert.ok(joinPage.includes("| 'accepted'"));
assert.ok(joinPage.includes('Вы уже присоединились'));

console.log('pair invite selfcheck passed');
