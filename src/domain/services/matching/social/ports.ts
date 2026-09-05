import type { MatchingAnswers } from "@/domain/model/matching/socialContract";
import type { ClientSession } from "mongoose";
import type { MatchingParticipantIds } from "@/domain/state/matching";

export type MatchingAuditRequest = {
  route: string;
  method: string;
  ip?: string;
  ua?: string;
};

export type MatchingParticipantFenceInput = {
  participantIds: MatchingParticipantIds;
  session: ClientSession;
};

/**
 * Writes the shared participant membership fence in the caller transaction.
 * Every flow which creates/blocks a social interaction or forms a Pair must
 * use the same fence so snapshot-isolation write skew becomes a retryable
 * write conflict.
 */
export interface MatchingParticipantFencePort {
  fence(input: MatchingParticipantFenceInput): Promise<void>;
}

export type MatchingCardSnapshot = {
  requirements: readonly [string, string, string];
  give: readonly [string, string, string];
  questions: Readonly<MatchingAnswers>;
  boundaries?: readonly [string, string, string];
  boundaryDealbreakers?: readonly [boolean, boolean, boolean];
  cardVersion?: 1 | 2;
  updatedAt?: Date;
};

export type CandidateGrantReservationInput = {
  token: string;
  requesterId: string;
  candidateId: string;
  senderCardSnapshot: MatchingCardSnapshot;
  senderCardRevision: number;
  targetCardSnapshot: MatchingCardSnapshot;
  targetCardRevision: number;
  likeId: string;
  now: Date;
  session: ClientSession;
};

export type CandidateGrantReservation = {
  grantId: string;
};

/**
 * The implementation is the anti-direct-ID boundary. In addition to validating
 * token ownership/expiry/revision, it must re-check current discovery
 * eligibility before reserving the grant for `likeId`.
 */
export interface CandidateGrantValidationPort {
  reserveForLike(
    input: CandidateGrantReservationInput,
  ): Promise<CandidateGrantReservation>;
}

export type PairFormationFromMatchingInput = {
  connectionId: string;
  participantIds: MatchingParticipantIds;
  sourceLikeIds: readonly string[];
  session: ClientSession;
  now: Date;
};

export type PairFormationFromMatchingResult = {
  pairId: string;
  alreadyFormed: boolean;
};

/** The implementation must use the shared membership-fenced Pair transaction core. */
export interface PairFormationPort {
  formFromMatchingConnection(
    input: PairFormationFromMatchingInput,
  ): Promise<PairFormationFromMatchingResult>;
}

export type SocialEffectName =
  | "LIKE_CREATED"
  | "LIKE_VIEWED"
  | "LIKE_RESPONDED"
  | "LIKE_ACCEPTED"
  | "LIKE_DECLINED"
  | "MATCHING_BLOCKED"
  | "MATCHING_UNBLOCKED"
  | "CONNECTION_CREATED"
  | "COUPLE_CONFIRMATION_REQUESTED"
  | "COUPLE_CONFIRMATION_CONFIRMED"
  | "COUPLE_CONFIRMATION_CANCELLED"
  | "PAIR_FORMED_FROM_MATCHING";

export type SocialEffectInput = {
  effectKey: string;
  name: SocialEffectName;
  actorId: string;
  participantIds: MatchingParticipantIds;
  resourceId: string;
  pairId?: string;
  auditRequest?: MatchingAuditRequest;
  session: ClientSession;
  now: Date;
};

/**
 * Effects must be transaction-aware and deduplicated by `effectKey`. Payloads
 * intentionally exclude answers, card contents, grants and preference data.
 */
export interface MatchingSocialEffectsPort {
  record(input: SocialEffectInput): Promise<void>;
}

export const noMatchingSocialEffects: MatchingSocialEffectsPort = {
  async record(): Promise<void> {
    return undefined;
  },
};
