import type { MatchLikeAction, MatchingConnectionDTO } from "@/client/api/match.api";
import type { MatchingEligibility } from "@/lib/contracts/matchingEligibility";

export const matchingHistoryAvailable = (input: {
  verified: boolean;
  entryCompleted: boolean;
  eligibility: MatchingEligibility;
}): boolean => input.verified && input.entryCompleted &&
  (input.eligibility === "EXISTING_PARTNER" || input.eligibility === "PAIR_ACTIVE");

/** Presentation only: resource ownership and action authorization stay on the server. */
export const matchingHistoryLikeActions = (actions: MatchLikeAction[], canProgress: boolean): MatchLikeAction[] =>
  canProgress ? actions : actions.filter((action) => action === "DECLINE" || action === "WITHDRAW" || action === "BLOCK");

export const matchingHistoryConnectionActions = (
  actions: MatchingConnectionDTO["allowedActions"],
  canProgress: boolean,
): MatchingConnectionDTO["allowedActions"] => canProgress ? actions :
  actions.filter((action) => action === "CANCEL" || action === "PAUSE" || action === "CLOSE");
