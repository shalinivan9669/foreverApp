/** Serializable matching transport types shared by the client and domain. */
export type MatchingAnswers = [string, string] | [string, string, string];
export type MatchingStatementSection = "give" | "requirements" | "boundaries";
export type MatchingStatementReaction = {
  section: MatchingStatementSection;
  index: number;
  reaction: "AGREE" | "NEUTRAL" | "AGAINST";
  note?: string;
};
export type MatchingSocialCard = {
  requirements: [string, string, string];
  give?: [string, string, string];
  boundaries?: [string, string, string];
  boundaryDealbreakers?: [boolean, boolean, boolean];
  questions: MatchingAnswers;
  cardVersion?: 1 | 2;
};
export type MatchingConversationRoundDTO = {
  topicKey: string;
  title: string;
  prompt: string;
  round: number;
  ownAnswer?: string;
  partnerSubmitted: boolean;
  partnerAnswer?: string;
  revealed: boolean;
};
export type MatchingConversationDTO = {
  topics: MatchingConversationRoundDTO[];
  checklist: { key: string; label: string; complete: boolean }[];
  canWrite: boolean;
  discordAvailable: boolean;
  discordConsent: boolean;
  discordUrl?: string;
};
