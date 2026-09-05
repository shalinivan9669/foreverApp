import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { entryProfileService } from '@/domain/services/entryProfile.service';
import { usersService } from '@/domain/services/users.service';
import { mvpOnboardingService, MVP_ONBOARDING_QUESTIONS, MVP_ONBOARDING_CONTENT_REVISION, MVP_ONBOARDING_POLICY_VERSION } from '@/domain/services/mvpOnboarding.service';
import { SEARCH_CITIES } from '@/domain/model/entry/cityCatalog';
import { User } from '@/models/User';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { EconomyWallet } from '@/models/EconomyWallet';
import { EconomyLedger } from '@/models/EconomyLedger';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { EventLog } from '@/models/EventLog';

const uri = process.env.MONGODB_URI?.trim();
if (!uri) throw new Error('Explicit local test Mongo URI is required');
const target = new URL(uri);
const database = decodeURIComponent(target.pathname.slice(1));
const replicaSet = target.searchParams.get('replicaSet');
if (target.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(target.hostname) || !database.endsWith('_test') || !replicaSet) {
  throw new Error('Only an explicit local replica set and a database ending in _test are allowed');
}
const userId = `entry-onboarding-${randomUUID()}`;

const main = async () => {
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5_000 });
  try {
    assert.equal((await mongoose.connection.db?.admin().command({ hello: 1 }))?.setName, replicaSet);
    await User.createIndexes();
    await MvpOnboardingSession.createIndexes();
    await EvidenceEvent.createIndexes();
    await IndividualFactorSnapshot.createIndexes();
    // The same minimal service call as Discord OAuth; no legacy demographic or
    // profile fixture is inserted to conceal defaults/validation regressions.
    await usersService.upsertCurrentUserProfile({ currentUserId: userId, payload: { username: 'Fresh entry fixture', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' } });
    const rawIdentity = await User.findOne({ id: userId }).lean();
    assert.ok(rawIdentity);
    assert.equal(rawIdentity.personal, undefined);
    assert.equal(rawIdentity.profile, undefined);
    const before = await entryProfileService.get(userId);
    assert.equal(before.onboardingCompleted, false);
    assert.equal(before.user.entryCompletedAt, undefined);
    assert.match(before.user.publicId, /^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);

    const profile = { cohort: 'SOLO' as const, age: 25, gender: 'female' as const, city: 'Небольшой город', locationMode: 'NONE' as const };
    const first = await entryProfileService.save({ currentUserId: userId, profile });
    assert.equal(first.user.publicId, before.user.publicId);
    assert.equal(first.user.personal?.relationshipStatus, 'seeking');
    assert.equal(first.user.personal?.city, profile.city);
    assert.equal(first.user.entryCohort, 'SOLO');
    assert.ok(first.user.entryCompletedAt);
    assert.equal(first.user.location, undefined);
    assert.equal((await User.findOne({ id: userId }).lean())?.profile, undefined);
    const city = SEARCH_CITIES[0];
    assert.ok(city);
    const catalog = await entryProfileService.save({ currentUserId: userId, profile: { ...profile, locationMode: 'CITY_CATALOG', searchCityId: city.id } });
    assert.deepEqual(catalog.user.location?.coordinates, [...city.coordinates]);
    const device = await entryProfileService.save({ currentUserId: userId, profile: { ...profile, locationMode: 'DEVICE', coordinates: [37.617891, 55.752234] } });
    assert.deepEqual(device.user.location?.coordinates, [37.62, 55.75]);
    assert.equal(device.user.entryCompletedAt, first.user.entryCompletedAt);
    const existing = await entryProfileService.save({ currentUserId: userId, profile: { ...profile, cohort: 'EXISTING_PARTNER' } });
    assert.equal(existing.user.personal?.relationshipStatus, 'seeking', 'cohort invented an actual Pair');
    assert.equal(existing.hasPair, false);
    assert.equal(existing.user.location, undefined);
    await assert.rejects(entryProfileService.save({ currentUserId: userId, profile: { ...profile, age: 17 } }), (error: Error) => error instanceof DomainError && error.code === 'VALIDATION_ERROR');

    await mvpOnboardingService.mutate({ currentUserId: userId, mutation: { action: 'start', contentRevision: MVP_ONBOARDING_CONTENT_REVISION, policyVersion: MVP_ONBOARDING_POLICY_VERSION, consent: { adultConfirmed: true, voluntaryParticipationConfirmed: true, privacyAcknowledged: true } } });
    for (const question of MVP_ONBOARDING_QUESTIONS) {
      const capturePolicy = question.optional ? 'PRIVATE' : 'PAIR_MODEL_ONLY';
      const value = question.optional ? { kind: 'skipped' as const }
        : question.kind === 'boolean' ? { kind: 'boolean' as const, booleanValue: true }
          : question.kind === 'multi' ? { kind: 'multi' as const, optionIds: question.choices?.slice(0, question.minSelections ?? 1).map((choice) => choice.id) ?? [] }
            : { kind: 'single' as const, optionId: question.choices?.[0]?.id };
      await mvpOnboardingService.mutate({ currentUserId: userId, mutation: { action: 'answer', questionId: question.id, questionRevision: question.revision, capturePolicy, value } });
    }
    const completed = await mvpOnboardingService.mutate({ currentUserId: userId, mutation: { action: 'complete' } });
    assert.equal(completed.session?.status, 'completed');
    assert.equal(completed.session?.modelStatus, 'MATERIALIZED');
    await Promise.all([
      mvpOnboardingService.getOwnerState({ currentUserId: userId }),
      mvpOnboardingService.mutate({ currentUserId: userId, mutation: { action: 'complete' } }),
      mvpOnboardingService.getOwnerState({ currentUserId: userId }),
    ]);
    assert.equal((await EconomyWallet.findById(userId).lean())?.balance, 1);
    assert.equal(await EconomyLedger.countDocuments({ userId, sourceKind: 'ONBOARDING' }), 1);
    assert.equal((await entryProfileService.get(userId)).onboardingCompleted, true);
    const owner = await User.findOne({ id: userId }).lean();
    assert.equal(owner?.publicId, before.user.publicId);
    assert.equal(owner?.profile, undefined, 'entry/onboarding materialized invalid legacy defaults');
    console.log(JSON.stringify({ suite: 'entry-onboarding', status: 'passed', database, minimalOAuthIdentity: true, unsupportedCityAllowed: true, coarseLocation: true, cohortIsNotPair: true, factorOnboardingMaterialized: true, singleCoinAfterRetries: true }));
  } finally {
    await Promise.all([
      User.deleteMany({ id: userId }), MvpOnboardingSession.deleteMany({ userId }),
      EconomyWallet.deleteMany({ _id: userId }), EconomyLedger.deleteMany({ userId }),
      EvidenceEvent.deleteMany({ $or: [{ actorId: userId }, { subjectId: userId }] }),
      IndividualFactorSnapshot.deleteMany({ subjectId: userId }), EventLog.deleteMany({ 'actor.userId': userId }),
    ]);
    await mongoose.disconnect();
  }
};
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
