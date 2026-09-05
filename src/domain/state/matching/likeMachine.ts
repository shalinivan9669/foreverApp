import { DomainError } from "@/domain/errors";

export const SOCIAL_LIKE_STATUSES = [
  "SENT",
  "VIEWED",
  "RESPONDED",
  "MATCHED",
  "DECLINED",
  "EXPIRED",
  "WITHDRAWN",
  "BLOCKED",
] as const;

export type SocialLikeStatus = (typeof SOCIAL_LIKE_STATUSES)[number];
export type SocialLikeMachineStatus = SocialLikeStatus | "DRAFT";
export type SocialLikeActorRole = "SENDER" | "RECIPIENT" | "SYSTEM";

export type SocialLikeSnapshot = {
  status: SocialLikeMachineStatus;
  revision: number;
  declinedByRole?: Exclude<SocialLikeActorRole, "SYSTEM">;
};

export type SocialLikeAction =
  | { type: "CREATE" }
  | { type: "VIEW" }
  | { type: "RESPOND" }
  | { type: "ACCEPT" }
  | { type: "DECLINE" }
  | { type: "EXPIRE" }
  | { type: "WITHDRAW" }
  | { type: "BLOCK" };

export type SocialLikeTransition = {
  outcome: "APPLIED" | "NOOP";
  previousStatus: SocialLikeMachineStatus;
  nextStatus: SocialLikeStatus;
  nextRevision: number;
};

export const TERMINAL_SOCIAL_LIKE_STATUSES: ReadonlySet<SocialLikeStatus> =
  new Set<SocialLikeStatus>(["MATCHED", "DECLINED", "EXPIRED", "BLOCKED", "WITHDRAWN"]);

export const isTerminalSocialLikeStatus = (
  status: SocialLikeMachineStatus,
): status is SocialLikeStatus =>
  status !== "DRAFT" && TERMINAL_SOCIAL_LIKE_STATUSES.has(status);

const accessDenied = (
  action: SocialLikeAction,
  actualRole: SocialLikeActorRole,
  expectedRole: SocialLikeActorRole,
): never => {
  throw new DomainError({
    code: "ACCESS_DENIED",
    status: 403,
    message: "Matching action is not allowed for the current participant",
    details: {
      action: action.type,
      actualRole,
      expectedRole,
    },
  });
};

const conflict = (
  snapshot: SocialLikeSnapshot,
  action: SocialLikeAction,
  actorRole: SocialLikeActorRole,
): never => {
  throw new DomainError({
    code: "MATCHING_STATE_CONFLICT",
    status: 409,
    message: "Matching action is not valid in the current state",
    details: {
      action: action.type,
      status: snapshot.status,
      actorRole,
    },
  });
};

const applied = (
  snapshot: SocialLikeSnapshot,
  nextStatus: SocialLikeStatus,
): SocialLikeTransition => ({
  outcome: "APPLIED",
  previousStatus: snapshot.status,
  nextStatus,
  nextRevision: snapshot.revision + 1,
});

const noop = (
  snapshot: SocialLikeSnapshot,
  status: SocialLikeStatus,
): SocialLikeTransition => ({
  outcome: "NOOP",
  previousStatus: snapshot.status,
  nextStatus: status,
  nextRevision: snapshot.revision,
});

export const socialLikeTransition = (
  snapshot: SocialLikeSnapshot,
  action: SocialLikeAction,
  actorRole: SocialLikeActorRole,
): SocialLikeTransition => {
  switch (action.type) {
    case "CREATE":
      if (actorRole !== "SENDER") accessDenied(action, actorRole, "SENDER");
      if (snapshot.status !== "DRAFT")
        return conflict(snapshot, action, actorRole);
      return applied(snapshot, "SENT");

    case "VIEW":
      if (actorRole !== "RECIPIENT") {
        accessDenied(action, actorRole, "RECIPIENT");
      }
      if (snapshot.status === "VIEWED") return noop(snapshot, "VIEWED");
      if (snapshot.status !== "SENT")
        return conflict(snapshot, action, actorRole);
      return applied(snapshot, "VIEWED");

    case "RESPOND":
      if (actorRole !== "RECIPIENT") {
        accessDenied(action, actorRole, "RECIPIENT");
      }
      if (snapshot.status === "MATCHED") return noop(snapshot, "MATCHED");
      if (snapshot.status !== "SENT" && snapshot.status !== "VIEWED") {
        return conflict(snapshot, action, actorRole);
      }
      return applied(snapshot, "MATCHED");

    case "ACCEPT":
      if (actorRole !== "SENDER") accessDenied(action, actorRole, "SENDER");
      if (snapshot.status === "MATCHED") return noop(snapshot, "MATCHED");
      if (snapshot.status !== "RESPONDED")
        return conflict(snapshot, action, actorRole);
      return applied(snapshot, "MATCHED");

    case "DECLINE": {
      if (
        snapshot.status === "DECLINED" &&
        snapshot.declinedByRole === actorRole
      ) {
        return noop(snapshot, "DECLINED");
      }
      const recipientCanDecline =
        actorRole === "RECIPIENT" &&
        (snapshot.status === "SENT" || snapshot.status === "VIEWED");
      const senderCanDecline =
        actorRole === "SENDER" && snapshot.status === "RESPONDED";
      if (!recipientCanDecline && !senderCanDecline) {
        return conflict(snapshot, action, actorRole);
      }
      return applied(snapshot, "DECLINED");
    }

    case "WITHDRAW":
      if (actorRole !== "SENDER") accessDenied(action, actorRole, "SENDER");
      if (snapshot.status === "WITHDRAWN") return noop(snapshot, "WITHDRAWN");
      if (snapshot.status !== "SENT" && snapshot.status !== "VIEWED") return conflict(snapshot, action, actorRole);
      return applied(snapshot, "WITHDRAWN");

    case "EXPIRE":
      if (actorRole !== "SYSTEM") accessDenied(action, actorRole, "SYSTEM");
      if (snapshot.status === "EXPIRED") return noop(snapshot, "EXPIRED");
      if (snapshot.status !== "SENT" && snapshot.status !== "VIEWED") {
        return conflict(snapshot, action, actorRole);
      }
      return applied(snapshot, "EXPIRED");

    case "BLOCK":
      if (actorRole === "SYSTEM") {
        return accessDenied(action, actorRole, "SENDER");
      }
      if (snapshot.status === "BLOCKED") return noop(snapshot, "BLOCKED");
      if (
        snapshot.status !== "SENT" &&
        snapshot.status !== "VIEWED" &&
        snapshot.status !== "RESPONDED" &&
        snapshot.status !== "MATCHED"
      ) {
        return conflict(snapshot, action, actorRole);
      }
      return applied(snapshot, "BLOCKED");
  }
};

export type LegacyLikeStatus =
  | "sent"
  | "viewed"
  | "awaiting_initiator"
  | "mutual_ready"
  | "paired"
  | "rejected"
  | "expired";

export const canonicalLikeStatusFromLegacy = (
  status: LegacyLikeStatus,
): SocialLikeStatus | null => {
  switch (status) {
    case "sent":
      return "SENT";
    case "viewed":
      return "VIEWED";
    case "awaiting_initiator":
      return "RESPONDED";
    case "mutual_ready":
      return "MATCHED";
    case "rejected":
      return "DECLINED";
    case "expired":
      return "EXPIRED";
    case "paired":
      return null;
  }
};
