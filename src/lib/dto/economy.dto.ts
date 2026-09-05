import type { EconomyLedgerType } from '@/models/EconomyLedger';
import type { EconomyItemKind, EconomySourceKind } from '@/domain/model/economy/catalog';

export type EconomyLedgerDTO = {
  id: string;
  kind: 'EARN' | 'SPEND' | 'CONTRIBUTE';
  delta: number;
  balanceAfter: number;
  label: string;
  createdAt: string;
};
export type EconomyCatalogItemDTO = {
  id: string;
  title: string;
  description: string;
  kind: EconomyItemKind;
  price: number;
  icon: string;
  ownedQuantity: number;
  equipped: boolean;
  appearance?: 'rose' | 'mint';
  contentKey?: string;
  odds: Array<{ title: string; icon: string; percent: number }>;
};
export type EconomyOverviewDTO = {
  balance: number;
  earnedTotal: number;
  spentTotal: number;
  equippedItemId: string | null;
  catalogVersion: number;
  catalog: EconomyCatalogItemDTO[];
  rewardRules: Array<{ kind: EconomySourceKind; title: string; amount: number; dailyLimit: number }>;
};
export type EconomyHistoryDTO = { items: EconomyLedgerDTO[]; nextCursor: string | null };
export type EconomyPairCollectionDTO = {
  pairId: string;
  readOnly: boolean;
  items: Array<{ itemId: string; title: string; icon: string; quantity: number }>;
};
export type EconomyContributionDTO = {
  receiptId: string;
  pairId: string;
  itemId: string;
  title: string;
  icon: string;
  quantity: 1;
  replayed: boolean;
};
export type EconomyPurchaseDTO = {
  receiptId: string;
  itemId: string;
  receivedItemId: string;
  receivedTitle: string;
  receivedIcon: string;
  cost: number;
  balanceAfter: number;
  replayed: boolean;
};

export const toEconomyLedgerDTO = (entry: EconomyLedgerType, label: string): EconomyLedgerDTO => ({
  id: entry._id,
  kind: entry.kind,
  delta: entry.delta,
  balanceAfter: entry.balanceAfter,
  label,
  createdAt: entry.createdAt.toISOString(),
});
