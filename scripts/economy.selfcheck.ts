import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { ECONOMY_CATALOG, ECONOMY_REWARD_RULES, economyCapsuleOutcome, economyRewardSource } from '@/domain/model/economy/catalog';
import { economyIdentity, economyService } from '@/domain/services/economy.service';
import { DomainError } from '@/domain/errors';
import { EconomyWallet, type EconomyWalletType } from '@/models/EconomyWallet';
import { EconomyLedger, type EconomyLedgerType } from '@/models/EconomyLedger';
import { EconomyInventory, type EconomyInventoryType } from '@/models/EconomyInventory';
import { EconomyPairCollection, type EconomyPairCollectionType } from '@/models/EconomyPairCollection';
import { pairContextAccess } from '@/domain/services/pairContextAccess.service';
import { User } from '@/models/User';

// Database-free transactional adapter: execute real domain commands with serial
// isolation, snapshot rollback and injected failures. This verifies command
// semantics, not MongoDB topology, installed indexes or driver retry labels.
const wallets = new Map<string, EconomyWalletType>();
const ledger = new Map<string, EconomyLedgerType>();
const inventory = new Map<string, EconomyInventoryType>();
const sharedCollection = new Map<string, EconomyPairCollectionType>();
const savedDescriptors: Array<{ target: object; key: string; descriptor?: PropertyDescriptor }> = [];
let failNextInventory = false;
let failNextContribution = false;
let pairStatus = 'active';
let queue = Promise.resolve();
let active = false;
const clone = <T>(value: T): T => structuredClone(value);
const query = <T>(value: T) => ({
  session: () => query(value),
  lean: async () => clone(value),
  then: (fulfilled: (result: T) => void, rejected?: (error: Error) => void) => Promise.resolve(value).then(fulfilled, rejected),
});
const stub = (target: object, key: string, value: object) => {
  savedDescriptors.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
};
const restoreMap = <T>(target: Map<string, T>, snapshot: Map<string, T>) => {
  target.clear();
  for (const [key, value] of snapshot) target.set(key, value);
};

type WalletUpdate = {
  $setOnInsert?: Omit<EconomyWalletType, '_id' | 'revision'>;
  $inc?: Partial<Pick<EconomyWalletType, 'revision' | 'balance' | 'earnedTotal' | 'spentTotal'>>;
  $set?: Partial<EconomyWalletType>;
  $unset?: { equippedItemId: number };
};
const updateWallet = (id: string, update: WalletUpdate): EconomyWalletType => {
  let wallet = wallets.get(id);
  if (!wallet && update.$setOnInsert) wallet = { _id: id, revision: 0, ...clone(update.$setOnInsert) };
  assert.ok(wallet, 'wallet must exist');
  if (update.$inc) {
    for (const key of ['revision', 'balance', 'earnedTotal', 'spentTotal'] as const) wallet[key] += update.$inc[key] ?? 0;
  }
  Object.assign(wallet, clone(update.$set ?? {}));
  if (update.$unset?.equippedItemId) delete wallet.equippedItemId;
  wallets.set(id, wallet);
  return clone(wallet);
};

const main = async () => {
  assert.deepEqual(Object.values(ECONOMY_REWARD_RULES).map((rule) => rule.amount), [1, 2, 3, 5]);
  assert.equal(economyRewardSource('ONBOARDING', 'old-revision'), economyRewardSource('ONBOARDING', 'new-revision'));
  assert.notEqual(economyIdentity('owner-a', 'reward', '1'), economyIdentity('owner-b', 'reward', '1'));
  assert.notEqual(economyIdentity('a', 'b:c', 'd'), economyIdentity('a:b', 'c', 'd'));
  const capsule = ECONOMY_CATALOG.find((item) => item.kind === 'CAPSULE');
  assert.ok(capsule);
  const distribution = new Map<string, number>();
  for (let roll = 0; roll < 100; roll += 1) {
    const outcome = economyCapsuleOutcome(capsule, roll);
    distribution.set(outcome, (distribution.get(outcome) ?? 0) + 1);
  }
  assert.deepEqual([...distribution.values()], [60, 30, 10]);
  assert.throws(() => economyCapsuleOutcome(capsule, -1));
  assert.throws(() => economyCapsuleOutcome(capsule, 100));

  const priorUri = process.env.MONGODB_URI;
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/economy_adapter_test';
  stub(mongoose, 'connect', async () => mongoose);
  const fakeSession = {
    inTransaction: () => active,
    endSession: async () => {},
    withTransaction: <T>(operation: () => Promise<T>): Promise<T> => {
      const pending = queue.then(async () => {
        const before = { wallets: clone(wallets), ledger: clone(ledger), inventory: clone(inventory), sharedCollection: clone(sharedCollection) };
        active = true;
        try { return await operation(); }
        catch (error) {
          restoreMap(wallets, before.wallets); restoreMap(ledger, before.ledger); restoreMap(inventory, before.inventory);
          restoreMap(sharedCollection, before.sharedCollection);
          throw error;
        } finally { active = false; }
      });
      queue = pending.then(() => {}, () => {});
      return pending;
    },
  };
  stub(mongoose, 'startSession', async () => fakeSession);
  stub(User, 'exists', (filter: { id: string }) => query(filter.id.startsWith('owner-') ? { _id: filter.id } : null));
  stub(EconomyWallet, 'findOneAndUpdate', (filter: { _id: string }, update: WalletUpdate) => query(updateWallet(filter._id, update)));
  stub(EconomyWallet, 'updateOne', async (filter: { _id: string }, update: WalletUpdate) => {
    updateWallet(filter._id, update); return { matchedCount: 1 };
  });
  stub(EconomyLedger, 'findById', (id: string) => query(ledger.get(id) ?? null));
  stub(EconomyLedger, 'create', async (entries: EconomyLedgerType[]) => {
    for (const entry of entries) { assert.equal(ledger.has(entry._id), false, 'ledger must be append-only'); ledger.set(entry._id, clone(entry)); }
    return entries;
  });
  stub(EconomyInventory, 'exists', (filter: { _id: string }) => query(inventory.has(filter._id) ? { _id: filter._id } : null));
  stub(EconomyInventory, 'findById', (id: string) => query(inventory.get(id) ?? null));
  stub(EconomyInventory, 'deleteOne', async (filter: { _id: string }) => ({ deletedCount: inventory.delete(filter._id) ? 1 : 0 }));
  stub(EconomyInventory, 'updateOne', async (filter: { _id: string }, update: { $setOnInsert?: Omit<EconomyInventoryType, '_id' | 'quantity'>; $inc: { quantity: number } }) => {
    if (failNextInventory) { failNextInventory = false; throw new Error('injected inventory failure'); }
    const entry = inventory.get(filter._id) ?? (update.$setOnInsert ? { _id: filter._id, quantity: 0, ...clone(update.$setOnInsert) } : null);
    assert.ok(entry);
    entry.quantity += update.$inc.quantity; inventory.set(filter._id, entry);
    return { matchedCount: 1 };
  });
  stub(pairContextAccess, 'read', async (pairId: string, userId: string) => {
    if (pairId !== 'pair-fixture' || !['owner-a', 'owner-b'].includes(userId) || pairStatus === 'ended') throw new DomainError({ code: 'NOT_FOUND', status: 404, message: 'Пара недоступна.' });
    return { _id: pairId, status: pairStatus };
  });
  stub(pairContextAccess, 'fence', async (pairId: string, userId: string) => {
    if (pairId !== 'pair-fixture' || !['owner-a', 'owner-b'].includes(userId) || pairStatus !== 'active') throw new DomainError({ code: 'NOT_FOUND', status: 404, message: 'Пара недоступна.' });
    return { status: pairStatus };
  });
  stub(EconomyPairCollection, 'updateOne', async (filter: { _id: string }, update: { $setOnInsert: Omit<EconomyPairCollectionType, '_id' | 'quantity'>; $inc: { quantity: number } }) => {
    if (failNextContribution) { failNextContribution = false; throw new Error('injected collection failure'); }
    const entry = sharedCollection.get(filter._id) ?? { _id: filter._id, quantity: 0, ...clone(update.$setOnInsert) };
    entry.quantity += update.$inc.quantity; sharedCollection.set(filter._id, entry);
    return { matchedCount: 1 };
  });

  try {
    await assert.rejects(economyService.rewardCompletion({ userId: 'missing', sourceKind: 'ONBOARDING', sourceId: 'session-1' }), (error: Error) => error instanceof DomainError && error.status === 404);
    const initial = await Promise.all(Array.from({ length: 12 }, (_, index) => economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'ONBOARDING', sourceId: `session-${index}` })));
    assert.equal(initial.filter((result) => result.awarded).length, 1);
    assert.equal(wallets.get('owner-a')?.balance, 1);
    assert.equal(ledger.size, 1);

    await economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'SOLO_PRACTICE', sourceId: 'practice-1' });
    await economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'SOLO_PRACTICE', sourceId: 'practice-1' });
    assert.equal(wallets.get('owner-a')?.balance, 4, 'retry must not award again');
    await economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'QUESTIONNAIRE', sourceId: 'test-1' });
    await economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'PAIR_ACTIVITY', sourceId: 'pair-1' });
    await economyService.rewardCompletion({ userId: 'owner-b', sourceKind: 'PAIR_ACTIVITY', sourceId: 'pair-1' });
    assert.equal(wallets.get('owner-a')?.balance, 11);
    assert.equal(wallets.get('owner-b')?.balance, 5);
    await economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'SOLO_PRACTICE', sourceId: 'practice-2' });
    await economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'SOLO_PRACTICE', sourceId: 'practice-3' });
    const capped = await economyService.rewardCompletion({ userId: 'owner-a', sourceKind: 'SOLO_PRACTICE', sourceId: 'practice-4' });
    assert.deepEqual(capped, { awarded: false, amount: 0 });
    assert.equal(wallets.get('owner-a')?.balance, 17);
    assert.ok([...ledger.values()].some((entry) => entry.reason === 'DAILY_LIMIT' && entry.delta === 0));

    await assert.rejects(economyService.assertContentAccess({ userId: 'owner-a', contentKey: 'reflection.deep-values-v1' }), (error: Error) => error instanceof DomainError && error.status === 403);
    await economyService.assertContentAccess({ userId: 'owner-a', contentKey: 'free-practice' });
    const purchase = { userId: 'owner-a', itemId: 'content.deep-values', operationId: 'purchase-1' };
    const results = await Promise.all(Array.from({ length: 8 }, () => economyService.purchase(purchase)));
    assert.equal(results.filter((entry) => !entry.replayed).length, 1);
    assert.equal(wallets.get('owner-a')?.balance, 14);
    await economyService.assertContentAccess({ userId: 'owner-a', contentKey: 'reflection.deep-values-v1' });
    await assert.rejects(economyService.assertContentAccess({ userId: 'owner-b', contentKey: 'reflection.deep-values-v1' }), (error: Error) => error instanceof DomainError && error.status === 403);
    await assert.rejects(economyService.purchase({ ...purchase, itemId: 'cosmetic.rose' }), /другой покупки/);
    await assert.rejects(economyService.purchase({ ...purchase, operationId: 'purchase-other-key' }), /уже есть/);
    assert.equal(wallets.get('owner-a')?.balance, 14);

    const beforeLedger = clone(ledger);
    failNextInventory = true;
    const capsulePurchase = { userId: 'owner-a', itemId: capsule.id, operationId: 'capsule-failure-retry' };
    await assert.rejects(economyService.purchase(capsulePurchase), /injected inventory failure/);
    assert.deepEqual(ledger, beforeLedger, 'ledger must roll back with failed inventory');
    assert.equal(wallets.get('owner-a')?.balance, 14, 'debit must roll back');
    const committed = await economyService.purchase(capsulePurchase);
    const replayed = await economyService.purchase(capsulePurchase);
    assert.equal(replayed.receivedItemId, committed.receivedItemId, 'capsule retry must preserve outcome');
    assert.equal(replayed.receiptId, committed.receiptId);
    assert.equal(wallets.get('owner-a')?.balance, 12);
    await economyService.purchase({ userId: 'owner-b', itemId: 'content.weekend-dialogue', operationId: 'b-1' });
    await assert.rejects(economyService.purchase({ userId: 'owner-b', itemId: 'collectible.star', operationId: 'b-2' }), /не хватает монет/);
    assert.equal(wallets.get('owner-b')?.balance, 2);

    await assert.rejects(economyService.equip({ userId: 'owner-a', itemId: 'cosmetic.rose' }), /не найдено/);
    await economyService.purchase({ userId: 'owner-a', itemId: 'cosmetic.rose', operationId: 'rose' });
    await economyService.equip({ userId: 'owner-a', itemId: 'cosmetic.rose' });
    assert.equal(wallets.get('owner-a')?.equippedItemId, 'cosmetic.rose');
    await economyService.equip({ userId: 'owner-a', itemId: null });
    assert.equal(wallets.get('owner-a')?.equippedItemId, undefined);

    const contributionCommand = { userId: 'owner-a', pairId: 'pair-fixture', itemId: committed.receivedItemId, operationId: 'shared-1' };
    const inventoryBefore = clone(inventory);
    const balanceBefore = wallets.get('owner-a')?.balance;
    failNextContribution = true;
    await assert.rejects(economyService.contribute(contributionCommand), /injected collection failure/);
    assert.deepEqual(inventory, inventoryBefore, 'failed shared write restores personal inventory');
    assert.equal(sharedCollection.size, 0);
    const transfers = await Promise.all(Array.from({ length: 5 }, () => economyService.contribute(contributionCommand)));
    assert.equal(transfers.filter((entry) => !entry.replayed).length, 1);
    assert.equal(inventory.has(economyIdentity('owner-a', 'inventory', contributionCommand.itemId)), false);
    assert.equal([...sharedCollection.values()][0].quantity, 1);
    assert.equal(wallets.get('owner-a')?.balance, balanceBefore);
    await assert.rejects(economyService.contribute({ ...contributionCommand, itemId: 'content.deep-values' }), /только коллекционный/);
    await assert.rejects(economyService.contribute({ ...contributionCommand, itemId: contributionCommand.itemId === 'collectible.sun' ? 'collectible.moon' : 'collectible.sun' }), /другого переноса/);
    await assert.rejects(economyService.contribute({ ...contributionCommand, operationId: 'shared-empty' }), /больше нет/);
    pairStatus = 'paused';
    await assert.rejects(economyService.contribute(contributionCommand), /Пара недоступна/);
    pairStatus = 'ended';
    await assert.rejects(economyService.contribute(contributionCommand), /Пара недоступна/);
    for (const [userId, wallet] of wallets) {
      const entries = [...ledger.values()].filter((entry) => entry.userId === userId);
      assert.equal(wallet.balance, entries.reduce((sum, entry) => sum + entry.delta, 0));
      assert.equal(wallet.earnedTotal - wallet.spentTotal, wallet.balance);
      assert.ok(wallet.balance >= 0);
    }
  } finally {
    for (const { target, key, descriptor } of savedDescriptors.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor); else Reflect.deleteProperty(target, key);
    }
    if (priorUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = priorUri;
  }

  const shared = readFileSync('src/app/api/economy/shared.ts', 'utf8');
  assert.match(shared, /requireSession\(req\)/);
  assert.match(shared, /enforceRateLimit/);
  const route = readFileSync('src/app/api/economy/purchases/route.ts', 'utf8');
  assert.match(route, /\.strict\(\)/);
  assert.match(route, /userId: auth\.data\.userId/);
  assert.doesNotMatch(route, /price:|amount:|rewardCompletion/);
  const contributionRoute = readFileSync('src/app/api/economy/contributions/route.ts', 'utf8');
  assert.doesNotMatch(contributionRoute, /withIdempotency/);
  assert.match(contributionRoute, /economyService\.contribute\(\{ userId: auth\.data\.userId/);
  const contributionService = readFileSync('src/domain/services/economy.service.ts', 'utf8').split('async contribute(')[1].split('async assertContentAccess(')[0];
  assert.ok(contributionService.indexOf('pairContextAccess.fence(') < contributionService.indexOf('EconomyLedger.findById('), 'active guard must precede even a stored receipt replay');
  const deletion = readFileSync('src/domain/services/accountDeletion.service.ts', 'utf8');
  for (const collection of ['economy_wallets', 'economy_ledger', 'economy_inventory', 'economy_pair_collection']) assert.ok(deletion.includes(collection));
  console.log('economy selfcheck passed: rewards, caps, ownership, idempotency, rollback, capsule replay, balance conservation, shared collection transfer/end deny (transactional adapter; no live DB)');
};

void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
