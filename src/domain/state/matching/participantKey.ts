import { DomainError } from "@/domain/errors";

export type MatchingParticipantIds = readonly [string, string];

const assertParticipantId = (value: string): string => {
  if (value.length === 0) {
    throw new DomainError({
      code: "VALIDATION_ERROR",
      status: 400,
      message: "Matching participant id is required",
    });
  }
  return value;
};

export const matchingParticipantIds = (
  left: string,
  right: string,
): MatchingParticipantIds => {
  const first = assertParticipantId(left);
  const second = assertParticipantId(right);
  if (first === second) {
    throw new DomainError({
      code: "MATCHING_SELF_INTERACTION",
      status: 409,
      message: "A matching interaction requires two different participants",
    });
  }

  return first < second ? [first, second] : [second, first];
};

export const matchingParticipantKey = (left: string, right: string): string =>
  matchingParticipantIds(left, right).join("|");

export const isMatchingParticipant = (
  participantIds: MatchingParticipantIds,
  actorId: string,
): boolean => participantIds[0] === actorId || participantIds[1] === actorId;

export const matchingPeerId = (
  participantIds: MatchingParticipantIds,
  actorId: string,
): string => {
  if (participantIds[0] === actorId) return participantIds[1];
  if (participantIds[1] === actorId) return participantIds[0];
  throw new DomainError({
    code: "NOT_FOUND",
    status: 404,
    message: "Matching resource was not found",
  });
};
