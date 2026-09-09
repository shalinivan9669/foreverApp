export type MeasuredPairProfileDTO = {
  status: 'active' | 'paused';
  cards: { factorKey: string; title: string; state: 'WAITING' | 'READY'; meaning: string; nextAction: string; revision: number | null }[];
};
