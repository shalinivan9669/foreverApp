import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { economyIdentity, economyService } from '@/domain/services/economy.service';
import { connectToDatabase } from '@/lib/mongodb';
import { EconomyWallet } from '@/models/EconomyWallet';
import { EconomyLedger } from '@/models/EconomyLedger';
import { EconomyInventory } from '@/models/EconomyInventory';
import { EconomyPairCollection } from '@/models/EconomyPairCollection';
import { Pair } from '@/models/Pair';
import { User } from '@/models/User';

// Explicit dedicated local replica set only. No env file, external host,
// global deletion, migration or production index changes are allowed here.
const uri = new URL(process.env.MONGODB_URI ?? 'http://invalid');
if (uri.protocol !== 'mongodb:' || uri.hostname !== '127.0.0.1' || uri.port !== '27029' ||
    uri.pathname !== '/vmeste_economy_product_test' || uri.searchParams.get('replicaSet') !== 'vmesteTest' || uri.username || uri.password) {
  throw new Error('Requires the dedicated local vmeste_economy_product_test replica-set URI');
}
const run = randomUUID();
const owners = [`economy-a-${run}`, `economy-b-${run}`, `economy-outsider-${run}`];
const [ownerA, ownerB, outsider] = owners;
const isMissing = (error: Error) => error instanceof DomainError && error.status === 404;
const isLocked = (error: Error) => error instanceof DomainError && error.status === 403;

const main = async () => {
  await connectToDatabase();
  try {
    // Built-in _id constraints are sufficient: auxiliary indexes are not applied.
    for (const model of [EconomyWallet, EconomyLedger, EconomyInventory, EconomyPairCollection, Pair, User]) {
      await model.createCollection();
    }
    for (const id of owners) await User.create({ id, username: 'local economy fixture', avatar: 'fixture', personal: { gender: 'male', age: 30, city: 'Test', relationshipStatus: 'in_relationship' }, profile: { onboarding: { seeking: { valuedQualities: ['kindness', 'honesty', 'respect'] } } } });
    const pair = await Pair.create({ members: [ownerA, ownerB].sort(), key: [ownerA, ownerB].sort().join('|'), status: 'active', contextVersion: 'pair-context-v1' });
    const pairId = String(pair._id);

    const onboarding = await Promise.all(Array.from({ length: 16 }, (_, i) => economyService.rewardCompletion({ userId: ownerA, sourceKind: 'ONBOARDING', sourceId: `revision-${i}` })));
    assert.equal(onboarding.filter((item) => item.awarded).length, 1);
    assert.equal((await economyService.overview(ownerA)).balance, 1);
    for (const userId of [ownerA, ownerB]) {
      for (const sourceKind of ['SOLO_PRACTICE', 'QUESTIONNAIRE', 'PAIR_ACTIVITY'] as const) {
        for (let index = 0; index < 3; index += 1) await economyService.rewardCompletion({ userId, sourceKind, sourceId: `${sourceKind}-${index}` });
      }
    }
    assert.equal((await economyService.overview(ownerA)).balance, 31);
    assert.deepEqual(await economyService.rewardCompletion({ userId: ownerA, sourceKind: 'SOLO_PRACTICE', sourceId: 'capped' }), { awarded: false, amount: 0 });
    await assert.rejects(economyService.assertContentAccess({ userId: ownerA, contentKey: 'reflection.deep-values-v1' }), isLocked);
    const paid = { userId: ownerA, itemId: 'content.deep-values', operationId: randomUUID() };
    const purchases = await Promise.all(Array.from({ length: 10 }, () => economyService.purchase(paid)));
    assert.equal(purchases.filter((item) => !item.replayed).length, 1);
    assert.equal((await economyService.overview(ownerA)).balance, 28);
    await economyService.assertContentAccess({ userId: ownerA, contentKey: 'reflection.deep-values-v1' });
    await assert.rejects(economyService.assertContentAccess({ userId: ownerB, contentKey: 'reflection.deep-values-v1' }), isLocked);
    await assert.rejects(economyService.purchase({ ...paid, itemId: 'cosmetic.rose' }), /другой покупки/);

    const capsule = { userId: ownerA, itemId: 'capsule.small-sign', operationId: randomUUID() };
    const draws = await Promise.all(Array.from({ length: 10 }, () => economyService.purchase(capsule)));
    assert.equal(draws.filter((item) => !item.replayed).length, 1);
    assert.equal(new Set(draws.map((item) => item.receivedItemId)).size, 1);
    const itemId = draws[0].receivedItemId;
    const ownedId = economyIdentity(ownerA, 'inventory', itemId);
    assert.equal((await EconomyInventory.findById(ownedId).lean())?.quantity, 1);
    const command = { userId: ownerA, pairId, itemId, operationId: randomUUID() };

    const originalDescriptor = Object.getOwnPropertyDescriptor(EconomyPairCollection, 'updateOne');
    Object.defineProperty(EconomyPairCollection, 'updateOne', { configurable: true, writable: true, value: async () => { throw new Error('injected shared write failure'); } });
    try { await assert.rejects(economyService.contribute(command), /injected shared write failure/); }
    finally { if (originalDescriptor) Object.defineProperty(EconomyPairCollection, 'updateOne', originalDescriptor); else Reflect.deleteProperty(EconomyPairCollection, 'updateOne'); }
    assert.equal((await EconomyInventory.findById(ownedId).lean())?.quantity, 1, 'real transaction must restore removed inventory');
    assert.equal(await EconomyLedger.countDocuments({ _id: economyIdentity(ownerA, 'contribution', command.operationId) }), 0);
    const transfers = await Promise.all(Array.from({ length: 10 }, () => economyService.contribute(command)));
    assert.equal(transfers.filter((item) => !item.replayed).length, 1);
    assert.equal(await EconomyInventory.countDocuments({ _id: ownedId }), 0);
    assert.equal((await economyService.overview(ownerA)).balance, 26);
    assert.equal((await economyService.pairCollection({ userId: ownerB, pairId })).items[0]?.quantity, 1);
    assert.equal((await economyService.pairCollection({ userId: ownerB, pairId: pairId.toUpperCase() })).items[0]?.quantity, 1);
    assert.equal((await economyService.contribute({ ...command, pairId: pairId.toUpperCase() })).replayed, true, 'ObjectId case must not split the shared context');
    await assert.rejects(economyService.contribute({ ...command, itemId: 'content.deep-values' }), /только коллекционный/);
    await assert.rejects(economyService.pairCollection({ userId: outsider, pairId }), isMissing);
    await assert.rejects(economyService.contribute({ ...command, userId: outsider }), isMissing);
    await assert.rejects(economyService.contribute({ ...command, operationId: randomUUID() }), /больше нет/);

    await economyService.purchase({ userId: ownerB, itemId, operationId: randomUUID() });
    const competing = await Promise.allSettled([randomUUID(), randomUUID()].map((operationId) => economyService.contribute({ userId: ownerB, pairId, itemId, operationId })));
    assert.equal(competing.filter((result) => result.status === 'fulfilled').length, 1, 'two commands cannot consume one inventory unit');
    const shared = await economyService.pairCollection({ userId: ownerA, pairId });
    assert.equal(shared.items[0]?.quantity, 2);
    assert.equal('userId' in shared.items[0], false);
    assert.equal('contributions' in shared, false);
    const exported = await economyService.exportOwnerData(ownerA);
    assert.equal(exported.ownContributions.length, 1);
    assert.equal(exported.ownContributions[0]?.quantity, 1);

    await Pair.updateOne({ _id: pairId }, { $set: { status: 'paused' }, $inc: { lifecycleRevision: 1 } });
    assert.equal((await economyService.pairCollection({ userId: ownerA, pairId })).readOnly, true);
    await assert.rejects(economyService.contribute(command), isMissing);
    await Pair.updateOne({ _id: pairId }, { $set: { status: 'ended' }, $inc: { lifecycleRevision: 1 } });
    await assert.rejects(economyService.contribute(command), isMissing);
    await assert.rejects(economyService.pairCollection({ userId: ownerA, pairId }), isMissing);
    const nextPair = await Pair.create({ members: [ownerA, ownerB].sort(), key: [ownerA, ownerB].sort().join('|'), status: 'active', contextVersion: 'pair-context-v1' });
    assert.equal((await economyService.pairCollection({ userId: ownerA, pairId: String(nextPair._id) })).items.length, 0);
    await assert.rejects(economyService.contribute({ ...command, pairId: String(nextPair._id) }), /другого переноса/);

    for (const userId of [ownerA, ownerB]) {
      const wallet = await EconomyWallet.findById(userId).lean();
      assert.ok(wallet);
      const entries = await EconomyLedger.find({ userId }).lean();
      assert.equal(wallet.balance, entries.reduce((sum, entry) => sum + entry.delta, 0));
      assert.equal(wallet.balance, wallet.earnedTotal - wallet.spentTotal);
      assert.ok(wallet.balance >= 0);
    }
    console.log('economy integration passed: real Mongo transactions; concurrent rewards/purchases/capsules/transfers; rollback; ownership/content gates; pause/end/reconnect; own export; balance conservation');
  } finally {
    // Run-scoped synthetic fixtures only; never clear or drop the database.
    await EconomyLedger.deleteMany({ userId: { $in: owners } });
    await EconomyInventory.deleteMany({ userId: { $in: owners } });
    await EconomyPairCollection.deleteMany({ userId: { $in: owners } });
    await EconomyWallet.deleteMany({ _id: { $in: owners } });
    await Pair.deleteMany({ members: { $in: owners } });
    await User.deleteMany({ id: { $in: owners } });
    await mongoose.disconnect();
  }
};
void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
