import type { MatchingConversationRoundDTO } from "@/lib/contracts/matchingProduct";
export type { MatchingConversationRoundDTO, MatchingConversationDTO } from "@/lib/contracts/matchingProduct";

export const MATCHING_CONVERSATION_TOPICS = [
  { key: "communication", title: "Ритм общения", prompt: "Как часто хочется общаться и как сказать, что нужна пауза?" },
  { key: "boundaries", title: "Личные границы", prompt: "Какие границы важны для безопасного и уважительного знакомства?" },
  { key: "daily-life", title: "Обычный день", prompt: "Как выглядит комфортный обычный день и место другого человека в нём?" },
  { key: "values", title: "Важные ценности", prompt: "Какие ценности хочется беречь вместе, а какие различия можно обсудить?" },
  { key: "relationship-work", title: "Готовность работать над отношениями", prompt: "Готов(а) ли я обсуждать сложности и менять свои действия? Что для этого нужно?" },
  { key: "mutual-interest", title: "Взаимный интерес", prompt: "Хочется ли мне продолжать это знакомство? Что поможет следующему шагу?" },
  { key: "shared-action", title: "Небольшое совместное действие", prompt: "Какое простое действие хочется сделать вместе и когда? Например, прогулка или разговор без отвлечений." },
  { key: "after-conversation", title: "После общения", prompt: "Что было комфортно, что оказалось трудным и что хочется предложить в следующий раз?" },
] as const;

export type ConversationAnswer = { userId: string; text: string; submittedAt: Date };
export type ConversationRoundRecord = {
  topicKey: string;
  round: number;
  participantIds: readonly string[];
  answers: readonly ConversationAnswer[];
  revealedAt?: Date;
};
/** Project each answer separately. A partner submission flag never contains their text. */
export const conversationRoundDTO = (
  topic: { key: string; title: string; prompt: string },
  record: ConversationRoundRecord | undefined,
  actorId: string,
): MatchingConversationRoundDTO => {
  const own = record?.answers.find((answer) => answer.userId === actorId);
  const partner = record?.answers.find((answer) => answer.userId !== actorId);
  const revealed = Boolean(record?.revealedAt && record.answers.length === 2);
  return {
    topicKey: topic.key, title: topic.title, prompt: topic.prompt,
    round: record?.round ?? 1,
    ...(own ? { ownAnswer: own.text } : {}),
    partnerSubmitted: Boolean(partner), revealed,
    ...(revealed && partner ? { partnerAnswer: partner.text } : {}),
  };
};

