export type EconomySourceKind =
  | 'ONBOARDING'
  | 'QUESTIONNAIRE'
  | 'SOLO_PRACTICE'
  | 'PAIR_ACTIVITY';

export type EconomyItemKind = 'COSMETIC' | 'COLLECTIBLE' | 'CONTENT' | 'CAPSULE';
export type EconomyCatalogItem = {
  id: string;
  title: string;
  description: string;
  kind: EconomyItemKind;
  price: number;
  icon: string;
  contentKey?: string;
  appearance?: 'rose' | 'mint';
  outcomes?: ReadonlyArray<{ itemId: string; weight: number }>;
};

// Versioned product configuration. No client input, answer value or Factor score
// may override amounts, caps, prices, odds or a reward's canonical identity.
export const ECONOMY_RULES_VERSION = 1;
export const ECONOMY_CATALOG_VERSION = 1;
export const ECONOMY_REWARD_RULES: Record<
  EconomySourceKind,
  { title: string; amount: number; dailyLimit: number }
> = {
  ONBOARDING: { title: 'Первая настройка', amount: 1, dailyLimit: 1 },
  QUESTIONNAIRE: { title: 'Завершённый тест', amount: 2, dailyLimit: 3 },
  SOLO_PRACTICE: { title: 'Личная практика', amount: 3, dailyLimit: 3 },
  PAIR_ACTIVITY: { title: 'Практика с двумя отзывами', amount: 5, dailyLimit: 3 },
};

export const ECONOMY_CATALOG: readonly EconomyCatalogItem[] = [
  { id: 'cosmetic.rose', title: 'Розовый сад', description: 'Оформление личного кошелька и знак в вашей коллекции.', kind: 'COSMETIC', price: 2, icon: '🌷', appearance: 'rose' },
  { id: 'cosmetic.mint', title: 'Тихий лес', description: 'Мятное оформление личного кошелька.', kind: 'COSMETIC', price: 2, icon: '🌿', appearance: 'mint' },
  { id: 'collectible.sun', title: 'Луч тепла', description: 'Символ небольшого доброго шага. Коллекция не оценивает ваши отношения.', kind: 'COLLECTIBLE', price: 1, icon: '☀️' },
  { id: 'collectible.moon', title: 'Тихая луна', description: 'Место для спокойствия в личной коллекции.', kind: 'COLLECTIBLE', price: 2, icon: '🌙' },
  { id: 'collectible.star', title: 'Своя звезда', description: 'Памятный знак для вашей коллекции.', kind: 'COLLECTIBLE', price: 3, icon: '⭐' },
  { id: 'content.deep-values', title: 'Мои ценности: глубже', description: 'Дополнительный тест для самостоятельного размышления. Не диагностика.', kind: 'CONTENT', price: 3, icon: '🧭', contentKey: 'reflection.deep-values-v1' },
  { id: 'content.weekend-dialogue', title: 'Выходные без спешки', description: 'Дополнительный сценарий для подготовки к спокойному разговору.', kind: 'CONTENT', price: 3, icon: '🍃', contentKey: 'scenario.weekend-dialogue-v1' },
  { id: 'capsule.small-sign', title: 'Маленький знак', description: 'Один предмет коллекции за заработанные монеты. Повтор предмета увеличивает его количество.', kind: 'CAPSULE', price: 2, icon: '🎁', outcomes: [{ itemId: 'collectible.sun', weight: 60 }, { itemId: 'collectible.moon', weight: 30 }, { itemId: 'collectible.star', weight: 10 }] },
];

export const economyItem = (itemId: string): EconomyCatalogItem | undefined =>
  ECONOMY_CATALOG.find((item) => item.id === itemId);

export const economyRewardSource = (kind: EconomySourceKind, sourceId: string): string =>
  kind === 'ONBOARDING' ? 'first-completion' : sourceId;

export const economyRewardAmount = (kind: EconomySourceKind, awardedToday: number): number => {
  const rule = ECONOMY_REWARD_RULES[kind];
  return awardedToday < rule.dailyLimit ? rule.amount : 0;
};

export const economyCapsuleOutcome = (item: EconomyCatalogItem, roll: number): string => {
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) throw new Error('Invalid capsule roll');
  if (item.kind !== 'CAPSULE' || !item.outcomes?.length) throw new Error('Invalid capsule');
  if (item.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0) !== 100) {
    throw new Error('Capsule odds must sum to 100');
  }
  let edge = 0;
  for (const outcome of item.outcomes) {
    edge += outcome.weight;
    if (roll < edge) return outcome.itemId;
  }
  throw new Error('Invalid capsule outcome');
};
