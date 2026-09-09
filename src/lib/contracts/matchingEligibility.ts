export type MatchingEligibilityInput = {
  entryCohort?: "SOLO" | "EXISTING_PARTNER";
  relationshipStatus?: "seeking" | "in_relationship";
  age?: number;
  hasPair?: boolean;
};

export type MatchingEligibility = "ELIGIBLE" | "ENTRY_REQUIRED" | "EXISTING_PARTNER" | "PAIR_ACTIVE" | "ADULT_REQUIRED";

/** Product eligibility only; consent, card readiness and disclosure retain their own gates. */
export function getMatchingEligibility(input: MatchingEligibilityInput): MatchingEligibility {
  if (input.hasPair) return "PAIR_ACTIVE";
  if (input.entryCohort === "EXISTING_PARTNER" || input.relationshipStatus === "in_relationship") return "EXISTING_PARTNER";
  if (input.entryCohort !== "SOLO") return "ENTRY_REQUIRED";
  if (!Number.isInteger(input.age) || (input.age ?? 0) < 18) return "ADULT_REQUIRED";
  return "ELIGIBLE";
}
