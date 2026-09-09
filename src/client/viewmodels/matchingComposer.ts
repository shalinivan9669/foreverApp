import type { MatchPublicCardDTO } from '@/client/api/match.api';
import type { MatchingAnswers, MatchingStatementReaction } from '@/lib/contracts/matchingProduct';

export function matchingComposerReadiness(card: MatchPublicCardDTO | undefined, answers: MatchingAnswers, reactions: MatchingStatementReaction[], agreements: boolean[]) {
  const sections = ['give', 'requirements', 'boundaries'] as const;
  const statements = sections.flatMap((section) => (card?.[section] ?? []).map((text, index) => ({ section, index, text })));
  const reacted = statements.filter(({ section, index }) => reactions.some((item) => item.section === section && item.index === index)).length;
  const conflict = reactions.some((item) => item.section === 'boundaries' && item.reaction === 'AGAINST' && card?.boundaryDealbreakers?.[item.index]);
  const answered = answers.filter((answer) => answer.trim().length > 0).length;
  return { statements, reacted, answered, conflict, reactionsReady: reacted === statements.length && !conflict, answersReady: answered === answers.length, ready: reacted === statements.length && !conflict && answered === answers.length && agreements.length === 3 && agreements.every(Boolean) };
}
