import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { SEARCH_CITIES } from '@/domain/model/entry/cityCatalog';
import { resolveEntryLocation, type EntryProfileInput } from '@/domain/services/entryProfile.service';
import { ensurePublicPairingId, generatePublicPairingId, PUBLIC_PAIRING_ID_PATTERN } from '@/domain/services/userPublicIdentity.service';
import { pairInviteService, generatePairInviteToken, hashPairInviteToken } from '@/domain/services/pairInvite.service';
import { pairInviteAcceptSchema, pairInviteConfirmationSchema, pairInviteLookupSchema } from '@/app/api/pair-invites/schemas';
import { mvpOnboardingService, MVP_ONBOARDING_CONTENT_REVISION, MVP_ONBOARDING_POLICY_VERSION } from '@/domain/services/mvpOnboarding.service';
import { economyService } from '@/domain/services/economy.service';
import { notificationService } from '@/domain/services/notification.service';
import { toUserDTO } from '@/lib/dto/user.dto';
import { User } from '@/models/User';
import { Pair } from '@/models/Pair';
import { PairInvite, type PairInviteType } from '@/models/PairInvite';
import { PairMembershipClaim } from '@/models/PairMembershipClaim';
import { MvpOnboardingSession, type MvpOnboardingSessionType } from '@/models/MvpOnboardingSession';
import { Like } from '@/models/Like';
import { MatchingConnection } from '@/models/MatchingConnection';
import { MatchingProfile } from '@/models/MatchingProfile';
import { CandidateDiscoveryProjection } from '@/models/CandidateDiscoveryProjection';
import { CandidatePresentationGrant } from '@/models/CandidatePresentationGrant';
import { MatchingFeedSession } from '@/models/MatchingFeedSession';
import { EventLog } from '@/models/EventLog';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { MeasurementTestSession } from '@/models/MeasurementTestSession';

// Model/transaction boundaries below are in-memory stubs. No real DB, socket,
// HTTP request, seed, migration, or filesystem mutation is performed.
type StubQuery<T> = Promise<T> & {
  select: () => StubQuery<T>; sort: () => StubQuery<T>;
  session: () => StubQuery<T>; lean: () => StubQuery<T>;
  limit: () => StubQuery<T>;
};
const query = <T>(value: T): StubQuery<T> => {
  const result = Promise.resolve(value) as StubQuery<T>;
  result.select = result.sort = result.session = result.lean = result.limit = () => result;
  return result;
};

const restores: Array<() => void> = [];
const replace = (target: object, key: string, value: object): void => {
  const original = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
  restores.push(() => { if (original) Object.defineProperty(target, key, original); else Reflect.deleteProperty(target, key); });
};

const run = async () => {
  const base: EntryProfileInput = { cohort: 'SOLO', age: 25, gender: 'female', city: 'Город вне каталога', locationMode: 'NONE' };
  assert.deepEqual(resolveEntryLocation(base), { location: null, locationSource: 'NONE' });
  assert.deepEqual(resolveEntryLocation({ ...base, locationMode: 'KEEP' }), {});
  assert.deepEqual(resolveEntryLocation({ ...base, locationMode: 'DEVICE', coordinates: [37.617891, 55.752234] }), { location: { type: 'Point', coordinates: [37.62, 55.75] }, locationSource: 'DEVICE' });
  const city = SEARCH_CITIES[0];
  assert.ok(city);
  assert.deepEqual(resolveEntryLocation({ ...base, locationMode: 'CITY_CATALOG', searchCityId: city.id }).location?.coordinates, [...city.coordinates]);
  for (const bad of [
    { ...base, locationMode: 'CITY_CATALOG' as const, searchCityId: 'unlisted-city' },
    { ...base, locationMode: 'DEVICE' as const, coordinates: [181, 0] as [number, number] },
    { ...base, locationMode: 'DEVICE' as const, coordinates: [NaN, 0] as [number, number] },
  ]) assert.throws(() => resolveEntryLocation(bad), DomainError);
  assert.equal(new Set(SEARCH_CITIES.map((item) => item.id)).size, SEARCH_CITIES.length);

  const code = generatePublicPairingId();
  assert.match(code, PUBLIC_PAIRING_ID_PATTERN);
  assert.notEqual(code, generatePublicPairingId());
  assert.equal(pairInviteLookupSchema.safeParse({ partnerCode: 'discord-user-123' }).success, false);
  assert.equal(pairInviteLookupSchema.safeParse({ partnerCode: '@telegram_name' }).success, false);
  const token = generatePairInviteToken();
  assert.equal(pairInviteLookupSchema.safeParse({ token, partnerCode: code }).success, false);
  assert.equal(pairInviteAcceptSchema.safeParse({ token }).success, false);
  assert.equal(pairInviteAcceptSchema.safeParse({ token, confirmation: 'THIS_IS_MY_PARTNER', userId: 'victim' }).success, false);
  assert.equal(pairInviteAcceptSchema.safeParse({ partnerCode: code.toLowerCase(), confirmation: 'THIS_IS_MY_PARTNER' }).success, true);
  assert.equal(pairInviteConfirmationSchema.safeParse({ partnerPublicId: code, confirmation: 'NO' }).success, false);
  assert.equal(pairInviteConfirmationSchema.safeParse({ partnerPublicId: code, confirmation: 'THIS_IS_MY_PARTNER' }).success, true);
  assert.equal(Object.hasOwn(toUserDTO({ id: 'owner', username: 'Owner', avatar: '', publicId: code, entryCohort: 'SOLO' }, { scope: 'public' }), 'publicId'), false);
  assert.equal(User.schema.path('publicId').options.immutable, true);
  assert.ok(User.schema.indexes().some(([keys, options]) => keys.publicId === 1 && options.unique && options.sparse));

  const oldUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = 'mongodb://in-memory-stub.invalid/never-connected';
  restores.push(() => { if (oldUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = oldUri; });
  replace(mongoose, 'connect', async () => mongoose);
  replace(globalThis, 'fetch', async () => { throw new Error('Unexpected network request'); });
  replace(mongoose, 'startSession', async () => ({ withTransaction: async <T>(work: () => Promise<T>) => work(), endSession: async () => {} }));

  const now = new Date('2026-09-05T12:00:00Z');
  const owner = { id: 'owner', username: 'Owner', publicId: generatePublicPairingId(), entryCohort: 'EXISTING_PARTNER' };
  const recipient = { id: 'recipient', username: 'Recipient', publicId: generatePublicPairingId(), entryCohort: 'EXISTING_PARTNER' };
  const fresh: { id: string; username: string; publicId?: string; entryCohort: string } = { id: 'fresh', username: 'Fresh', entryCohort: 'SOLO' };
  const users = [owner, recipient, fresh];
  replace(User, 'findOne', (filter: { id?: string; publicId?: string }) => query(users.find((user) => filter.id ? user.id === filter.id : user.publicId === filter.publicId) ?? null));
  let assignmentAttempts = 0;
  replace(User.collection, 'updateOne', async (filter: { id: string; publicId: { $exists: boolean } }, update: { $set: { publicId: string } }) => {
    assignmentAttempts += 1;
    assert.equal(filter.publicId.$exists, false);
    const user = users.find((item) => item.id === filter.id);
    if (user && !user.publicId) user.publicId = update.$set.publicId;
    return { matchedCount: user ? 1 : 0 };
  });
  const generated = await Promise.all([ensurePublicPairingId('fresh'), ensurePublicPairingId('fresh')]);
  assert.equal(generated[0], generated[1], 'parallel first reads changed public identity');
  assert.match(generated[0], PUBLIC_PAIRING_ID_PATTERN);
  const before = assignmentAttempts;
  assert.equal(await ensurePublicPairingId('fresh'), generated[0]);
  assert.equal(assignmentAttempts, before, 'existing public code was rewritten');
  await assert.rejects(ensurePublicPairingId('missing'), (error: Error) => error instanceof DomainError && error.code === 'USER_NOT_FOUND');

  let invite: PairInviteType & { _id: Types.ObjectId } = { _id: new Types.ObjectId(), creatorUserId: owner.id, tokenHash: hashPairInviteToken(token), status: 'ACTIVE', expiresAt: new Date(now.getTime() + 60_000), createdAt: now, updatedAt: now };
  let pairCreated = 0;
  let claimsCreated = 0;
  let pairId: Types.ObjectId | undefined;
  let fences = 0;
  replace(User, 'updateMany', async () => { fences += 1; return { matchedCount: 2 }; });
  replace(Pair, 'findOne', () => query(pairCreated && pairId ? { _id: pairId } : null));
  replace(Pair, 'create', async (rows: Array<{ _id: Types.ObjectId; members: string[] }>) => { pairCreated += 1; pairId = rows[0]?._id; assert.deepEqual(rows[0]?.members, [owner.id, recipient.id]); return rows; });
  let measuredPairReads = 0;
  replace(Pair, 'findOneAndUpdate', async () => { measuredPairReads++; return { _id: pairId, members: [owner.id, recipient.id], status: 'active' }; });
  replace(User, 'updateOne', async () => ({ matchedCount: 1 }));
  replace(EvidenceEvent, 'aggregate', () => query([]));
  replace(MeasurementTestSession, 'find', () => query([]));
  replace(PairMembershipClaim, 'find', () => query([]));
  replace(PairMembershipClaim, 'insertMany', async (rows: Array<{ userId: string }>) => { claimsCreated += rows.length; return rows; });
  replace(MvpOnboardingSession, 'exists', () => query({ _id: new Types.ObjectId() }));
  replace(MvpOnboardingSession, 'distinct', () => query([owner.id, recipient.id]));
  replace(PairInvite, 'findOne', (filter: { tokenHash?: string; creatorUserId?: string; _id?: Types.ObjectId | string }) => query(
    (filter.tokenHash && filter.tokenHash !== invite.tokenHash) ||
    (filter.creatorUserId && filter.creatorUserId !== invite.creatorUserId) ||
    (filter._id && String(filter._id) !== String(invite._id)) ? null : { ...invite },
  ));
  replace(PairInvite, 'findById', () => query({ ...invite }));
  replace(PairInvite, 'findOneAndUpdate', (filter: { status: string; $or?: Array<{ acceptedByUserId: string | { $exists: boolean } }> }, update: { $set: Partial<PairInviteType> }) => {
    if (filter.status !== invite.status) return query(null);
    const claimant = update.$set.acceptedByUserId;
    if (filter.$or && invite.acceptedByUserId && invite.acceptedByUserId !== claimant) return query(null);
    invite = { ...invite, ...update.$set };
    return query({ ...invite });
  });
  for (const model of [PairInvite, Like, MatchingConnection, MatchingProfile, CandidateDiscoveryProjection, CandidatePresentationGrant]) replace(model, 'updateMany', async () => ({ modifiedCount: 0 }));
  replace(MatchingFeedSession, 'deleteMany', async () => ({ deletedCount: 0 }));
  replace(notificationService, 'create', async () => []);
  replace(EventLog, 'create', async () => ({ _id: new Types.ObjectId(), event: 'PAIR_CREATED', ts: now.getTime(), retentionTier: 'STANDARD', expiresAt: now }));

  const lookup = { currentUserId: recipient.id, partnerCode: owner.publicId, now };
  const available = await pairInviteService.resolve(lookup);
  assert.deepEqual(available.partner, { publicId: owner.publicId, username: owner.username });
  const claimed = await pairInviteService.accept(lookup);
  assert.equal(claimed.status, 'AWAITING_PARTNER_CONFIRMATION');
  assert.equal(invite.status, 'ACTIVE');
  assert.equal(pairCreated, 0, 'recipient claim created a Pair');
  assert.equal(claimsCreated, 0, 'recipient claim occupied a membership claim');
  assert.ok(fences > 0);
  assert.equal((await pairInviteService.accept(lookup)).alreadyAccepted, true);
  assert.equal((await pairInviteService.resolve(lookup)).state, 'WAITING_CONFIRMATION');
  assert.equal((await pairInviteService.ownerCurrent({ currentUserId: owner.id, now })).invite?.partner?.publicId, recipient.publicId);
  const confirmation = { currentUserId: owner.id, inviteId: String(invite._id), partnerPublicId: recipient.publicId, now };
  const unavailable = (error: Error) => error instanceof DomainError && error.code === 'PAIR_INVITE_UNAVAILABLE';
  await assert.rejects(pairInviteService.confirm({ ...confirmation, currentUserId: recipient.id }), unavailable);
  await assert.rejects(pairInviteService.confirm({ ...confirmation, partnerPublicId: owner.publicId }), unavailable);
  const recipientConfirmedAt = invite.recipientConfirmedAt;
  invite.recipientConfirmedAt = undefined;
  await assert.rejects(pairInviteService.confirm(confirmation), unavailable);
  invite.recipientConfirmedAt = recipientConfirmedAt;
  recipient.entryCohort = 'SOLO';
  await assert.rejects(pairInviteService.confirm(confirmation), (error: Error) => error instanceof DomainError && error.code === 'PAIR_ENTRY_REQUIRED');
  assert.equal(pairCreated, 0);
  recipient.entryCohort = 'EXISTING_PARTNER';
  const accepted = await pairInviteService.confirm(confirmation);
  assert.equal(accepted.status, 'ACCEPTED');
  assert.equal(pairCreated, 1);
  assert.equal(measuredPairReads, 1, 'pair creation must materialize permitted factor context');
  assert.equal(claimsCreated, 2);
  assert.equal(invite.creatorConfirmedAt?.toISOString(), now.toISOString());
  assert.equal((await pairInviteService.confirm(confirmation)).pairId, accepted.pairId);
  const recipientRetry = await pairInviteService.accept(lookup);
  assert.equal(recipientRetry.status, 'ACCEPTED');
  if (recipientRetry.status === 'ACCEPTED') assert.equal(recipientRetry.pairId, accepted.pairId);
  assert.equal(pairCreated, 1, 'confirmation retry created another Pair');

  const completed: MvpOnboardingSessionType = { userId: owner.id, contentRevision: MVP_ONBOARDING_CONTENT_REVISION, policyVersion: MVP_ONBOARDING_POLICY_VERSION, status: 'completed', consent: { adultConfirmed: true, voluntaryParticipationConfirmed: true, privacyAcknowledged: true, confirmedAt: now }, answers: [], cursor: 12, factorEngine: { status: 'MATERIALIZED', evidenceEventIds: [], individualSnapshotIds: [] }, startedAt: now, completedAt: now, createdAt: now, updatedAt: now };
  replace(MvpOnboardingSession, 'findOne', () => query(completed));
  let rewardAttempts = 0;
  replace(economyService, 'rewardCompletion', async (input: { userId: string; sourceKind: string }) => { assert.equal(input.userId, owner.id); assert.equal(input.sourceKind, 'ONBOARDING'); rewardAttempts += 1; return { awarded: rewardAttempts === 1, amount: 1 }; });
  await mvpOnboardingService.getOwnerState({ currentUserId: owner.id });
  await mvpOnboardingService.getOwnerState({ currentUserId: owner.id });
  assert.equal(rewardAttempts, 2, 'completed reload must retry the idempotent reward after a partial failure');
  completed.factorEngine.status = 'PENDING';
  await mvpOnboardingService.getOwnerState({ currentUserId: owner.id });
  assert.equal(rewardAttempts, 2, 'unmaterialized onboarding must not award a coin');
  console.log('entry pairing selfcheck passed (in-memory boundaries; no DB/network)');
};

void run().finally(() => { for (const restore of restores.reverse()) restore(); }).catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
