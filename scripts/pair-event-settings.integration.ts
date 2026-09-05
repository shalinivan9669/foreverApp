import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { pairEventService, isPairEventFactorBindingEligible } from '@/domain/services/pairEvent.service';
import { sharedLifeService } from '@/domain/services/sharedLife.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { connectToDatabase } from '@/lib/mongodb';
import { DEFAULT_SHARED_LIFE_SETTINGS, type SharedLifeSettings } from '@/lib/contracts/sharedLife';
import { Pair } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import { PairEvent } from '@/models/PairEvent';
import { PairWorkspace } from '@/models/PairWorkspace';
import { User } from '@/models/User';

const uri = new URL(process.env.MONGODB_URI ?? 'http://invalid');
if (uri.protocol !== 'mongodb:' || uri.hostname !== '127.0.0.1' || uri.port !== '27029' ||
    uri.pathname !== '/vmeste_economy_product_test' || uri.searchParams.get('replicaSet') !== 'vmesteTest' || uri.username || uri.password) {
  throw new Error('Requires the dedicated local vmeste_economy_product_test replica-set URI');
}
const runId = randomUUID();
const owners = [`pair-settings-a-${runId}`, `pair-settings-b-${runId}`];
const now = new Date('2026-02-05T00:00:00.000Z');
const today = '2026-02-05';
const stateConflict = (error: Error) => error instanceof DomainError && error.status === 409;

const main = async () => {
  await connectToDatabase();
  const weeklyDescriptor = Object.getOwnPropertyDescriptor(weeklyCycleService, 'current');
  // Isolate the unrelated weekly evaluator. Pair/workspace/event guards, writes,
  // transactions, safe action/factor bindings and generated activities are real.
  Object.defineProperty(weeklyCycleService, 'current', { configurable: true, writable: true, value: async () => ({ cycleKey: '2026-W06', pair: { bothSubmitted: false, dataStatus: 'NOT_READY', signals: [] } }) });
  try {
    for (const model of [Pair, PairActivity, PairEvent, PairWorkspace, User]) await model.createCollection();
    for (const id of owners) await User.create({ id, username: 'synthetic event fixture', avatar: 'fixture', personal: { gender: 'male', age: 30, city: 'Test', relationshipStatus: 'in_relationship' }, profile: { onboarding: { seeking: { valuedQualities: ['kindness', 'honesty', 'respect'] } } } });
    const pair = await Pair.create({ members: owners, key: [...owners].sort().join('|'), status: 'active', contextVersion: 'pair-context-v1', createdAt: new Date('2026-01-05T00:00:00.000Z') });
    const pairId = String(pair._id);
    const context = { pairId, currentUserId: owners[0], now };
    const setSettings = async (settings: SharedLifeSettings) => {
      const existing = await PairWorkspace.findById(pairId).lean();
      return sharedLifeService.update(pairId, owners[0], { action: 'SETTINGS', expectedRevision: existing?.revision ?? 0, settings }, today);
    };
    const initial = await pairEventService.refreshPairEvents(context);
    assert.equal(initial.some((event) => event.category === 'relationship_milestone'), false, 'app joining date must not create relationship dates');
    assert.ok(initial.some((event) => event.category === 'calendar_event'));

    await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, relationshipStartDate: '2025-02-05' });
    const offers = await pairEventService.refreshPairEvents(context);
    const anniversary = offers.find((event) => event.type === 'anniversary');
    const calendar = offers.find((event) => event.category === 'calendar_event');
    assert.ok(anniversary && calendar);
    await pairEventService.acceptEvent({ ...context, eventId: anniversary.id });
    const acceptedBefore = await PairEvent.findById(anniversary.id).lean();
    assert.ok(acceptedBefore);
    assert.equal(acceptedBefore.status, 'accepted');
    assert.ok(isPairEventFactorBindingEligible(acceptedBefore));

    await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, relationshipStartDate: '2024-02-05', holidaysEnabled: false });
    await assert.rejects(pairEventService.assertMutationAccess({ ...context, eventId: calendar.id, action: 'accept' }), stateConflict, 'HTTP pre-replay check must reject disabled settings');
    await assert.rejects(pairEventService.acceptEvent({ ...context, eventId: anniversary.id }), stateConflict, 'accepted history stays visible but cannot create more effects under disabled settings');
    await assert.rejects(pairEventService.acceptEvent({ ...context, eventId: calendar.id }), stateConflict, 'stale accept must check settings before refresh');
    await assert.rejects(pairEventService.snoozeEvent({ ...context, eventId: calendar.id }), stateConflict);
    const disabled = await pairEventService.refreshPairEvents({ ...context, include: 'all' });
    assert.equal(disabled.some((event) => event.id === calendar.id), false);
    assert.equal((await PairEvent.findById(calendar.id).lean())?.status, 'expired');
    const acceptedAfter = await PairEvent.findById(anniversary.id).lean();
    assert.equal(acceptedAfter?.status, 'accepted');
    assert.deepEqual(acceptedAfter?.source, acceptedBefore.source, 'same anniversary key must not rewrite accepted history for changed start year');
    assert.deepEqual(acceptedAfter?.title, acceptedBefore.title);
    assert.ok(disabled.some((event) => event.id === anniversary.id));

    await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, relationshipStartDate: '2026-01-06', holidaysEnabled: false });
    const firstMonth = (await pairEventService.refreshPairEvents(context)).find((event) => event.type === 'first_month');
    assert.ok(firstMonth);
    await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, relationshipStartDate: '2026-01-10', holidaysEnabled: false });
    await assert.rejects(pairEventService.acceptEvent({ ...context, eventId: firstMonth.id }), stateConflict);
    const corrected = await pairEventService.refreshPairEvents(context);
    assert.equal((await PairEvent.findById(firstMonth.id).lean())?.status, 'expired');
    assert.equal(corrected.find((event) => event.type === 'first_month')?.eventDate?.slice(0, 10), '2026-02-10');
    await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, holidaysEnabled: false });
    const cleared = await pairEventService.refreshPairEvents(context);
    assert.equal(cleared.some((event) => event.category === 'relationship_milestone' && event.status !== 'accepted'), false);

    await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, holidaysEnabled: true });
    let raced = false;
    const refreshedAfterConfigChange = await pairEventService.refreshPairEvents(context, { beforeTransactionalPairGuard: async () => {
      if (raced) return;
      raced = true;
      await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, holidaysEnabled: false });
    } });
    assert.equal(refreshedAfterConfigChange.some((event) => event.category === 'calendar_event'), false, 'prefetched candidates must not revive disabled calendars after a settings write');
    await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, holidaysEnabled: true });
    const beforeAcceptRace = (await pairEventService.refreshPairEvents(context)).find((event) => event.category === 'calendar_event');
    assert.ok(beforeAcceptRace);
    let acceptRaced = false;
    await assert.rejects(pairEventService.acceptEvent({ ...context, eventId: beforeAcceptRace.id }, { beforeMutationTransactionalPairGuard: async () => {
      if (acceptRaced) return;
      acceptRaced = true;
      await setSettings({ ...DEFAULT_SHARED_LIFE_SETTINGS, holidaysEnabled: false });
    } }), stateConflict, 'settings changed before mutation fence must reject an already open card');
    assert.notEqual((await PairEvent.findById(beforeAcceptRace.id).lean())?.status, 'accepted');
    const generated = await PairActivity.find({ pairId: pair._id }).lean();
    assert.ok(generated.length > 0);
    assert.ok(generated.every((activity) => activity.actionDefinition?.registryVersion && activity.targetFactorKeys?.length));
    await Pair.updateOne({ _id: pair._id }, { $set: { status: 'ended' }, $inc: { lifecycleRevision: 1 } });
    await assert.rejects(pairEventService.assertMutationAccess({ ...context, eventId: anniversary.id, action: 'accept' }), (error: Error) => error instanceof DomainError && error.status === 404, 'historical HTTP replay must not bypass ended Pair');
    console.log('pair event settings integration passed: explicit start date, real Pair fences/settings writes, stale accept/snooze deny, pending expiry, accepted history preserved, refresh/config race, canonical safe activities');
  } finally {
    if (weeklyDescriptor) Object.defineProperty(weeklyCycleService, 'current', weeklyDescriptor); else Reflect.deleteProperty(weeklyCycleService, 'current');
    const pairs = await Pair.find({ members: { $in: owners } }).select({ _id: 1 }).lean();
    const pairIds = pairs.map((pair) => pair._id);
    await PairEvent.deleteMany({ pairId: { $in: pairIds } });
    await PairActivity.deleteMany({ pairId: { $in: pairIds } });
    await PairWorkspace.deleteMany({ _id: { $in: pairIds.map(String) } });
    await Pair.deleteMany({ _id: { $in: pairIds } });
    await User.deleteMany({ id: { $in: owners } });
    await mongoose.disconnect();
  }
};
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
