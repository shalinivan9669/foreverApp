import { createHash, randomInt } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import { DomainError } from '@/domain/errors';
import {
  ECONOMY_CATALOG, ECONOMY_CATALOG_VERSION, ECONOMY_REWARD_RULES,
  ECONOMY_RULES_VERSION, economyCapsuleOutcome, economyItem,
  economyRewardAmount, economyRewardSource, type EconomySourceKind,
} from '@/domain/model/economy/catalog';
import { connectToDatabase } from '@/lib/mongodb';
import {
  toEconomyLedgerDTO, type EconomyHistoryDTO, type EconomyOverviewDTO,
  type EconomyPurchaseDTO, type EconomyPairCollectionDTO, type EconomyContributionDTO,
} from '@/lib/dto/economy.dto';
import { EconomyWallet, type EconomyDailyAwards, type EconomyWalletType } from '@/models/EconomyWallet';
import { EconomyLedger, type EconomyLedgerType } from '@/models/EconomyLedger';
import { EconomyInventory, type EconomyInventoryType } from '@/models/EconomyInventory';
import { EconomyPairCollection, type EconomyPairCollectionType } from '@/models/EconomyPairCollection';
import { User } from '@/models/User';
import { pairContextAccess } from './pairContextAccess.service';

const HISTORY_LIMIT = 25;
const EXPORT_LIMIT = 250;
const MAX_BALANCE = 1_000_000_000;
const zeroAwards = (): EconomyDailyAwards => ({ ONBOARDING: 0, QUESTIONNAIRE: 0, SOLO_PRACTICE: 0, PAIR_ACTIVITY: 0 });

export const economyIdentity = (userId: string, kind: string, sourceId: string): string =>
  createHash('sha256').update(JSON.stringify(['economy-v1', userId, kind, sourceId])).digest('hex');

const invalid = (code: string, message: string, status = 409): never => {
  throw new DomainError({ code, message, status });
};
const identityPart = (value: string): string => {
  if (!value.trim() || value.length > 256) return invalid('VALIDATION_ERROR', 'Некорректный идентификатор', 400);
  return value;
};

// All money/inventory effects share the owner's wallet write fence. Deterministic
// _id identities are protected by built-in indexes even with autoIndex:false.
// withTransaction retries transient write conflicts; an initial-wallet upsert
// duplicate is retried outside the aborted transaction with the same command.
const transact = async <T>(operation: (session: ClientSession) => Promise<T>, supplied?: ClientSession): Promise<T> => {
  await connectToDatabase();
  if (supplied) {
    if (!supplied.inTransaction()) return invalid('ECONOMY_TRANSACTION_REQUIRED', 'Операция требует транзакцию', 500);
    return operation(supplied);
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(() => operation(session));
      if (result === undefined) return invalid('ECONOMY_TRANSACTION_FAILED', 'Не удалось сохранить операцию', 500);
      return result;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 11000) || attempt === 2) throw error;
    } finally {
      await session.endSession();
    }
  }
  return invalid('ECONOMY_TRANSACTION_FAILED', 'Не удалось сохранить операцию', 500);
};

const fenceWallet = async (userId: string, now: Date, session: ClientSession): Promise<EconomyWalletType> => {
  identityPart(userId);
  if (!(await User.exists({ id: userId }).session(session))) return invalid('NOT_FOUND', 'Аккаунт недоступен', 404);
  const wallet = await EconomyWallet.findOneAndUpdate(
    { _id: userId },
    { $setOnInsert: { balance: 0, earnedTotal: 0, spentTotal: 0, rewardDay: now.toISOString().slice(0, 10), dailyAwards: zeroAwards() }, $inc: { revision: 1 } },
    { upsert: true, new: true, session, runValidators: true },
  ).lean<EconomyWalletType>();
  if (!wallet) return invalid('ECONOMY_WALLET_UNAVAILABLE', 'Кошелёк недоступен', 500);
  return wallet;
};

const ledgerLabel = (entry: EconomyLedgerType): string => {
  if (entry.kind === 'CONTRIBUTE') return `В общую коллекцию: ${economyItem(entry.itemId ?? '')?.title ?? 'предмет'}`;
  if (entry.kind === 'SPEND') return `Покупка: ${economyItem(entry.itemId ?? '')?.title ?? 'предмет'}`;
  const title = entry.sourceKind ? ECONOMY_REWARD_RULES[entry.sourceKind].title : 'Полезное действие';
  return entry.reason === 'DAILY_LIMIT' ? `${title}: дневная награда уже получена` : title;
};

const purchaseDTO = (receipt: EconomyLedgerType, replayed: boolean): EconomyPurchaseDTO => {
  const received = economyItem(receipt.outcomeItemId ?? receipt.itemId ?? '');
  return {
    receiptId: receipt._id, itemId: receipt.itemId ?? '',
    receivedItemId: receipt.outcomeItemId ?? receipt.itemId ?? '',
    receivedTitle: received?.title ?? 'Предмет коллекции', receivedIcon: received?.icon ?? '✦',
    cost: -receipt.delta, balanceAfter: receipt.balanceAfter, replayed,
  };
};

type HistoryCursor = { date: string; id: string };
const decodeCursor = (cursor?: string): HistoryCursor | null => {
  if (!cursor) return null;
  if (cursor.length > 100) return invalid('VALIDATION_ERROR', 'Некорректная страница истории', 400);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)~([a-f0-9]{64})$/.exec(cursor);
  if (!match || !Number.isFinite(Date.parse(match[1]))) return invalid('VALIDATION_ERROR', 'Некорректная страница истории', 400);
  return { date: match[1], id: match[2] };
};

export const economyService = {
  async rewardCompletion(input: {
    userId: string; sourceId: string; sourceKind: EconomySourceKind; session?: ClientSession;
  }): Promise<{ awarded: boolean; amount: number }> {
    const sourceId = economyRewardSource(input.sourceKind, identityPart(input.sourceId));
    const id = economyIdentity(identityPart(input.userId), `reward:${input.sourceKind}`, sourceId);
    const now = new Date();
    return transact(async (session) => {
      const wallet = await fenceWallet(input.userId, now, session);
      const previous = await EconomyLedger.findById(id).session(session).lean<EconomyLedgerType | null>();
      if (previous) return { awarded: false, amount: previous.delta };
      const day = now.toISOString().slice(0, 10);
      const dailyAwards = wallet.rewardDay === day ? { ...wallet.dailyAwards } : zeroAwards();
      const amount = economyRewardAmount(input.sourceKind, dailyAwards[input.sourceKind]);
      if (wallet.balance + amount > MAX_BALANCE) return invalid('ECONOMY_BALANCE_LIMIT', 'Достигнут предел кошелька');
      if (amount > 0) dailyAwards[input.sourceKind] += 1;
      await EconomyLedger.create([{
        _id: id, userId: input.userId, kind: 'EARN', delta: amount, balanceAfter: wallet.balance + amount,
        sourceKind: input.sourceKind, sourceId, reason: amount ? 'COMPLETION' : 'DAILY_LIMIT',
        rulesVersion: ECONOMY_RULES_VERSION, catalogVersion: ECONOMY_CATALOG_VERSION, createdAt: now,
      }], { session });
      await EconomyWallet.updateOne({ _id: input.userId, revision: wallet.revision }, {
        $inc: { balance: amount, earnedTotal: amount }, $set: { rewardDay: day, dailyAwards },
      }, { session, runValidators: true });
      return { awarded: amount > 0, amount };
    }, input.session);
  },

  async overview(userId: string): Promise<EconomyOverviewDTO> {
    await connectToDatabase();
    const [wallet, inventory] = await Promise.all([
      EconomyWallet.findById(identityPart(userId)).lean<EconomyWalletType | null>(),
      EconomyInventory.find({ userId }).limit(ECONOMY_CATALOG.length).lean<EconomyInventoryType[]>(),
    ]);
    const quantities = new Map(inventory.map((entry) => [entry.itemId, entry.quantity]));
    return {
      balance: wallet?.balance ?? 0, earnedTotal: wallet?.earnedTotal ?? 0, spentTotal: wallet?.spentTotal ?? 0,
      equippedItemId: wallet?.equippedItemId ?? null, catalogVersion: ECONOMY_CATALOG_VERSION,
      catalog: ECONOMY_CATALOG.map((item) => ({
        id: item.id, title: item.title, description: item.description, kind: item.kind, price: item.price,
        icon: item.icon, ownedQuantity: quantities.get(item.id) ?? 0, equipped: wallet?.equippedItemId === item.id,
        ...(item.appearance ? { appearance: item.appearance } : {}), ...(item.contentKey ? { contentKey: item.contentKey } : {}),
        odds: (item.outcomes ?? []).map((outcome) => ({ title: economyItem(outcome.itemId)?.title ?? 'Предмет', icon: economyItem(outcome.itemId)?.icon ?? '✦', percent: outcome.weight })),
      })),
      rewardRules: (Object.keys(ECONOMY_REWARD_RULES) as EconomySourceKind[]).map((kind) => ({ kind, ...ECONOMY_REWARD_RULES[kind] })),
    };
  },

  async history(userId: string, cursor?: string): Promise<EconomyHistoryDTO> {
    await connectToDatabase();
    const after = decodeCursor(cursor);
    const rows = await EconomyLedger.find({
      userId: identityPart(userId), ...(after ? { $or: [{ createdAt: { $lt: new Date(after.date) } }, { createdAt: new Date(after.date), _id: { $lt: after.id } }] } : {}),
    }).sort({ createdAt: -1, _id: -1 }).limit(HISTORY_LIMIT + 1).lean<EconomyLedgerType[]>();
    const page = rows.slice(0, HISTORY_LIMIT);
    const last = page.at(-1);
    return {
      items: page.map((entry) => toEconomyLedgerDTO(entry, ledgerLabel(entry))),
      nextCursor: rows.length > HISTORY_LIMIT && last ? `${last.createdAt.toISOString()}~${last._id}` : null,
    };
  },

  async purchase(input: { userId: string; itemId: string; operationId: string }): Promise<EconomyPurchaseDTO> {
    const item = economyItem(input.itemId);
    if (!item) return invalid('NOT_FOUND', 'Предмет недоступен', 404);
    const receiptId = economyIdentity(identityPart(input.userId), 'purchase', identityPart(input.operationId));
    // Sample once before transaction retries. Committed outcome is always reused.
    const receivedItemId = item.kind === 'CAPSULE' ? economyCapsuleOutcome(item, randomInt(100)) : item.id;
    const now = new Date();
    return transact(async (session) => {
      const wallet = await fenceWallet(input.userId, now, session);
      const previous = await EconomyLedger.findById(receiptId).session(session).lean<EconomyLedgerType | null>();
      if (previous) {
        if (previous.kind !== 'SPEND' || previous.itemId !== item.id) return invalid('IDEMPOTENCY_KEY_REUSE_CONFLICT', 'Ключ операции уже использован для другой покупки');
        return purchaseDTO(previous, true);
      }
      const inventoryId = economyIdentity(input.userId, 'inventory', receivedItemId);
      if (item.kind !== 'CAPSULE' && await EconomyInventory.exists({ _id: inventoryId }).session(session)) {
        return invalid('ECONOMY_ALREADY_OWNED', 'Этот предмет уже есть в вашей коллекции');
      }
      if (wallet.balance < item.price) return invalid('ECONOMY_INSUFFICIENT_COINS', 'Пока не хватает монет. Их можно заработать за полезные действия');
      const receipt: EconomyLedgerType = {
        _id: receiptId, userId: input.userId, kind: 'SPEND', delta: -item.price, balanceAfter: wallet.balance - item.price,
        sourceId: receiptId, itemId: item.id, outcomeItemId: receivedItemId, reason: 'PURCHASE',
        rulesVersion: ECONOMY_RULES_VERSION, catalogVersion: ECONOMY_CATALOG_VERSION, createdAt: now,
      };
      await EconomyLedger.create([receipt], { session });
      await EconomyWallet.updateOne({ _id: input.userId, revision: wallet.revision }, { $inc: { balance: -item.price, spentTotal: item.price } }, { session, runValidators: true });
      await EconomyInventory.updateOne({ _id: inventoryId }, {
        $setOnInsert: { userId: input.userId, itemId: receivedItemId, acquiredAt: now }, $inc: { quantity: 1 },
      }, { upsert: true, session, runValidators: true });
      return purchaseDTO(receipt, false);
    });
  },

  async equip(input: { userId: string; itemId: string | null }): Promise<{ equippedItemId: string | null }> {
    return transact(async (session) => {
      await fenceWallet(input.userId, new Date(), session);
      if (input.itemId !== null) {
        const item = economyItem(input.itemId);
        if (item?.kind !== 'COSMETIC' || !(await EconomyInventory.exists({ _id: economyIdentity(input.userId, 'inventory', input.itemId) }).session(session))) {
          return invalid('ECONOMY_ITEM_UNAVAILABLE', 'Оформление не найдено в вашей коллекции', 404);
        }
      }
      await EconomyWallet.updateOne({ _id: input.userId }, input.itemId === null ? { $unset: { equippedItemId: 1 } } : { $set: { equippedItemId: input.itemId } }, { session });
      return { equippedItemId: input.itemId };
    });
  },

  async pairCollection(input: { userId: string; pairId: string }): Promise<EconomyPairCollectionDTO> {
    const pair = await pairContextAccess.read(input.pairId, input.userId);
    const pairId = String(pair._id);
    const rows = await EconomyPairCollection.find({ pairId }).limit(ECONOMY_CATALOG.length * 2).lean<EconomyPairCollectionType[]>();
    const items = ECONOMY_CATALOG.filter((item) => item.kind === 'COLLECTIBLE').map((item) => ({
      itemId: item.id, title: item.title, icon: item.icon,
      quantity: rows.filter((row) => row.itemId === item.id).reduce((sum, row) => sum + row.quantity, 0),
    })).filter((item) => item.quantity > 0);
    return { pairId, readOnly: pair.status !== 'active', items };
  },

  async contribute(input: { userId: string; pairId: string; itemId: string; operationId: string }): Promise<EconomyContributionDTO> {
    const item = economyItem(input.itemId);
    if (item?.kind !== 'COLLECTIBLE') return invalid('ECONOMY_NOT_SHAREABLE', 'В общую коллекцию можно перенести только коллекционный предмет', 400);
    // Resource guard normalizes invalid ids and hides foreign/ended contexts.
    const pair = await pairContextAccess.read(input.pairId, input.userId);
    const pairId = String(pair._id);
    const receiptId = economyIdentity(identityPart(input.userId), 'contribution', identityPart(input.operationId));
    const result = (replayed: boolean): EconomyContributionDTO => ({ receiptId, pairId, itemId: item.id, title: item.title, icon: item.icon, quantity: 1, replayed });
    const now = new Date();
    return transact(async (session) => {
      // Fence even a replay: an ended/paused Pair cannot accept a command.
      await pairContextAccess.fence(pairId, input.userId, session);
      const wallet = await fenceWallet(input.userId, now, session);
      const previous = await EconomyLedger.findById(receiptId).session(session).lean<EconomyLedgerType | null>();
      if (previous) {
        if (previous.kind !== 'CONTRIBUTE' || previous.itemId !== item.id || previous.pairId !== pairId) return invalid('IDEMPOTENCY_KEY_REUSE_CONFLICT', 'Ключ операции уже использован для другого переноса');
        return result(true);
      }
      const inventoryId = economyIdentity(input.userId, 'inventory', item.id);
      const owned = await EconomyInventory.findById(inventoryId).session(session).lean<EconomyInventoryType | null>();
      if (!owned || owned.quantity < 1) return invalid('ECONOMY_ITEM_UNAVAILABLE', 'Предмета больше нет в вашей личной коллекции', 409);
      if (owned.quantity === 1) await EconomyInventory.deleteOne({ _id: inventoryId }, { session });
      else await EconomyInventory.updateOne({ _id: inventoryId }, { $inc: { quantity: -1 } }, { session, runValidators: true });
      await EconomyPairCollection.updateOne({ _id: economyIdentity(input.userId, `pair-collection:${pairId}`, item.id) }, {
        $setOnInsert: { pairId, userId: input.userId, itemId: item.id, contributedAt: now }, $inc: { quantity: 1 },
      }, { upsert: true, session, runValidators: true });
      await EconomyLedger.create([{
        _id: receiptId, userId: input.userId, kind: 'CONTRIBUTE', delta: 0, balanceAfter: wallet.balance,
        sourceId: receiptId, itemId: item.id, pairId, reason: 'CONTRIBUTION',
        rulesVersion: ECONOMY_RULES_VERSION, catalogVersion: ECONOMY_CATALOG_VERSION, createdAt: now,
      }], { session });
      return result(false);
    });
  },

  async assertContentAccess(input: { userId: string; contentKey: string; session?: ClientSession }): Promise<void> {
    const product = ECONOMY_CATALOG.find((item) => item.kind === 'CONTENT' && item.contentKey === input.contentKey);
    if (!product) return;
    await connectToDatabase();
    const query = EconomyInventory.exists({ _id: economyIdentity(identityPart(input.userId), 'inventory', product.id) });
    if (input.session) query.session(input.session);
    if (!(await query)) return invalid('ECONOMY_CONTENT_LOCKED', 'Этот дополнительный набор можно открыть за заработанные монеты', 403);
  },

  async exportOwnerData(userId: string) {
    await connectToDatabase();
    const [overview, rows, contributions] = await Promise.all([
      this.overview(userId),
      EconomyLedger.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(EXPORT_LIMIT + 1).lean<EconomyLedgerType[]>(),
      EconomyPairCollection.find({ userId }).sort({ contributedAt: -1, _id: -1 }).limit(EXPORT_LIMIT + 1).lean<EconomyPairCollectionType[]>(),
    ]);
    return { wallet: { balance: overview.balance, earnedTotal: overview.earnedTotal, spentTotal: overview.spentTotal, equippedItemId: overview.equippedItemId }, inventory: overview.catalog.filter((item) => item.ownedQuantity > 0).map((item) => ({ itemId: item.id, quantity: item.ownedQuantity })), ledger: rows.slice(0, EXPORT_LIMIT).map((row) => toEconomyLedgerDTO(row, ledgerLabel(row))), ledgerTruncated: rows.length > EXPORT_LIMIT, ledgerLimit: EXPORT_LIMIT,
      ownContributions: contributions.slice(0, EXPORT_LIMIT).map((entry) => ({ pairId: entry.pairId, itemId: entry.itemId, quantity: entry.quantity, contributedAt: entry.contributedAt.toISOString() })), contributionsTruncated: contributions.length > EXPORT_LIMIT, contributionsLimit: EXPORT_LIMIT };
  },
};
