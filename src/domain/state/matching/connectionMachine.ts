import { DomainError } from "@/domain/errors";
import {
  isMatchingParticipant,
  type MatchingParticipantIds,
} from "@/domain/state/matching/participantKey";

export type MatchingConnectionStage =
  "MATCHED" | "TALKING" | "DATING" | "COUPLE_CONFIRMED";

export type MatchingConnectionStatus = "ACTIVE" | "PAUSED" | "CLOSED" | "BLOCKED";

export type CoupleConfirmationSnapshot = {
  requestedBy?: string;
  requestedAt?: Date;
  confirmedBy: readonly string[];
  revision: number;
};

export type MatchingConnectionSnapshot = {
  participantIds: MatchingParticipantIds;
  stage: MatchingConnectionStage;
  status: MatchingConnectionStatus;
  coupleConfirmation: CoupleConfirmationSnapshot;
  pairId?: string;
  revision: number;
};

export type MatchingConnectionAction =
  | { type: "REQUEST"; at: Date }
  | { type: "CONFIRM"; at: Date }
  | { type: "CANCEL"; at: Date }
  | { type: "BLOCK"; at: Date }
  | { type: "CLOSE"; at: Date }
  | { type: "PAUSE"; at: Date }
  | { type: "RESUME"; at: Date }
  | { type: "PAIR_FORMED"; pairId: string; at: Date };

export type MatchingConnectionTransition = {
  outcome: "APPLIED" | "NOOP";
  next: MatchingConnectionSnapshot;
};

const notFound = (): never => {
  throw new DomainError({
    code: "NOT_FOUND",
    status: 404,
    message: "Matching connection was not found",
  });
};

const conflict = (
  snapshot: MatchingConnectionSnapshot,
  action: MatchingConnectionAction,
): never => {
  throw new DomainError({
    code: "MATCHING_CONNECTION_STATE_CONFLICT",
    status: 409,
    message: "Connection action is not valid in the current state",
    details: {
      action: action.type,
      stage: snapshot.stage,
      status: snapshot.status,
    },
  });
};

const applied = (
  snapshot: MatchingConnectionSnapshot,
  patch: Partial<MatchingConnectionSnapshot>,
): MatchingConnectionTransition => ({
  outcome: "APPLIED",
  next: {
    ...snapshot,
    ...patch,
    revision: snapshot.revision + 1,
  },
});

const noop = (
  snapshot: MatchingConnectionSnapshot,
): MatchingConnectionTransition => ({ outcome: "NOOP", next: snapshot });

const resetConfirmation = (
  confirmation: CoupleConfirmationSnapshot,
): CoupleConfirmationSnapshot => ({
  confirmedBy: [],
  revision: confirmation.revision + 1,
});

export const matchingConnectionTransition = (
  snapshot: MatchingConnectionSnapshot,
  action: MatchingConnectionAction,
  actorId: string | "SYSTEM",
): MatchingConnectionTransition => {
  if (
    actorId !== "SYSTEM" &&
    !isMatchingParticipant(snapshot.participantIds, actorId)
  ) {
    return notFound();
  }

  switch (action.type) {
    case "REQUEST": {
      if (actorId === "SYSTEM") return notFound();
      if (snapshot.status !== "ACTIVE" || snapshot.stage === "COUPLE_CONFIRMED") {
        return conflict(snapshot, action);
      }
      if (snapshot.pairId) return conflict(snapshot, action);
      if (snapshot.coupleConfirmation.requestedBy === actorId) {
        return noop(snapshot);
      }
      if (snapshot.coupleConfirmation.requestedBy) {
        return conflict(snapshot, action);
      }
      return applied(snapshot, {
        coupleConfirmation: {
          requestedBy: actorId,
          requestedAt: action.at,
          confirmedBy: [actorId],
          revision: snapshot.coupleConfirmation.revision + 1,
        },
      });
    }

    case "CONFIRM": {
      if (actorId === "SYSTEM") return notFound();
      if (snapshot.status !== "ACTIVE") return conflict(snapshot, action);
      if (
        snapshot.stage === "COUPLE_CONFIRMED" &&
        snapshot.coupleConfirmation.confirmedBy.includes(actorId)
      ) {
        return noop(snapshot);
      }
      if (snapshot.stage === "COUPLE_CONFIRMED" || snapshot.pairId) {
        return conflict(snapshot, action);
      }
      const requestedBy = snapshot.coupleConfirmation.requestedBy;
      if (!requestedBy || requestedBy === actorId) {
        return conflict(snapshot, action);
      }
      const confirmedBy = [
        ...new Set([...snapshot.coupleConfirmation.confirmedBy, actorId]),
      ].sort();
      if (confirmedBy.length !== 2) return conflict(snapshot, action);
      return applied(snapshot, {
        stage: "COUPLE_CONFIRMED",
        coupleConfirmation: {
          requestedBy,
          requestedAt: snapshot.coupleConfirmation.requestedAt,
          confirmedBy,
          revision: snapshot.coupleConfirmation.revision + 1,
        },
      });
    }

    case "CANCEL":
      if (actorId === "SYSTEM") return notFound();
      if (snapshot.status !== "ACTIVE" || snapshot.pairId) {
        return conflict(snapshot, action);
      }
      if (
        snapshot.stage !== "COUPLE_CONFIRMED" &&
        !snapshot.coupleConfirmation.requestedBy
      ) {
        return noop(snapshot);
      }
      if (snapshot.stage === "COUPLE_CONFIRMED") return conflict(snapshot, action);
      return applied(snapshot, {
        coupleConfirmation: resetConfirmation(snapshot.coupleConfirmation),
      });

    case "BLOCK":
      if (actorId === "SYSTEM") return notFound();
      if (snapshot.status === "BLOCKED") return noop(snapshot);
      if (snapshot.status === "CLOSED" || snapshot.pairId) {
        return conflict(snapshot, action);
      }
      return applied(snapshot, {
        status: "BLOCKED",
        coupleConfirmation: resetConfirmation(snapshot.coupleConfirmation),
      });

    case "PAUSE":
    case "RESUME": {
      if (actorId === "SYSTEM") return notFound();
      if (snapshot.pairId || (snapshot.status !== "ACTIVE" && snapshot.status !== "PAUSED")) return conflict(snapshot, action);
      const status = action.type === "PAUSE" ? "PAUSED" : "ACTIVE";
      if (snapshot.status === status) return noop(snapshot);
      return applied(snapshot, { status, coupleConfirmation: resetConfirmation(snapshot.coupleConfirmation) });
    }

    case "CLOSE":
      if (snapshot.status === "CLOSED") return noop(snapshot);
      if (snapshot.status === "BLOCKED" || snapshot.pairId) {
        return conflict(snapshot, action);
      }
      return applied(snapshot, {
        status: "CLOSED",
        coupleConfirmation: resetConfirmation(snapshot.coupleConfirmation),
      });

    case "PAIR_FORMED":
      if (actorId !== "SYSTEM") return notFound();
      if (snapshot.pairId === action.pairId) return noop(snapshot);
      if (snapshot.pairId) return conflict(snapshot, action);
      if (
        snapshot.status !== "ACTIVE" ||
        snapshot.stage !== "COUPLE_CONFIRMED" ||
        snapshot.coupleConfirmation.confirmedBy.length !== 2
      ) {
        return conflict(snapshot, action);
      }
      return applied(snapshot, { pairId: action.pairId });
  }
};
