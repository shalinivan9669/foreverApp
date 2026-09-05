import { DomainError } from '@/domain/errors';

import type { MatchingSocialCard, MatchingStatementReaction } from "@/lib/contracts/matchingProduct";
export type { MatchingAnswers, MatchingStatementSection, MatchingStatementReaction, MatchingSocialCard } from "@/lib/contracts/matchingProduct";

export const MATCHING_ACTIVE_CONNECTION_LIMIT = 3;
export const MATCHING_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const MATCHING_OCCUPIED_STATUSES = ['ACTIVE', 'PAUSED'] as const;

const invalid = (message: string): never => {
  throw new DomainError({ code: 'VALIDATION_ERROR', status: 400, message });
};

export function validateMatchingResponse(
  card: MatchingSocialCard,
  answers: readonly string[],
  reactions: readonly MatchingStatementReaction[] = [],
): void {
  if (answers.length !== card.questions.length || answers.some((answer) => !answer.trim() || answer.length > 280)) {
    invalid('Ответьте на все вопросы этой версии анкеты.');
  }
  if (card.cardVersion !== 2 && reactions.length === 0) return;
  const expected = new Set<string>();
  for (const section of ['give', 'requirements', 'boundaries'] as const) {
    card[section]?.forEach((_, index) => expected.add(`${section}:${index}`));
  }
  const seen = new Set<string>();
  for (const item of reactions) {
    const key = `${item.section}:${item.index}`;
    if (!expected.has(key) || seen.has(key) || !['AGREE', 'NEUTRAL', 'AGAINST'].includes(item.reaction) || (item.note?.length ?? 0) > 280) {
      invalid('Проверьте реакции на пункты анкеты.');
    }
    if (item.section === 'boundaries' && card.boundaryDealbreakers?.[item.index] && item.reaction === 'AGAINST') {
      throw new DomainError({ code: 'MATCHING_DEALBREAKER_CONFLICT', status: 409, message: 'Вы отметили несогласие с принципиальной границей. Запрос нельзя отправить.' });
    }
    seen.add(key);
  }
  if (seen.size !== expected.size) invalid('Отметьте реакцию на каждый пункт анкеты.');
}

export function assertMatchingConnectionCapacity(counts: readonly number[]): void {
  if (counts.some((count) => count >= MATCHING_ACTIVE_CONNECTION_LIMIT)) {
    throw new DomainError({ code: 'MATCHING_CONNECTION_LIMIT', status: 409, message: 'Доступно не более трёх активных знакомств, включая знакомства на паузе.' });
  }
}

export const matchingRequestExpired = (createdAt: Date | undefined, now: Date): boolean =>
  Boolean(createdAt && createdAt.getTime() + MATCHING_REQUEST_TTL_MS <= now.getTime());
