import { Pair } from "@/models/Pair";
import { matchingConnectionTransition, matchingParticipantIds } from "@/domain/state/matching";
import { assertMatchingSolo, loadMatchingPeople, mutualMatchingGenderEligible } from "./matchingEligibility.service";
import { MATCHING_REQUEST_TTL_MS, type MatchingAnswers, type MatchingStatementReaction } from "@/domain/model/matching/socialContract";
import { createHash, randomBytes } from "node:crypto";
import mongoose, {
  Types,
  type ClientSession,
  type UpdateQuery,
} from "mongoose";
import { DomainError } from "@/domain/errors";
import { MVP_FACTOR_REGISTRY } from "@/domain/model/definitions/mvpDefinitions";
import {
  projectMatchingCandidateIntelligence,
  type MatchingEvaluation,
  type MatchingExplanation,
  type PartnerPreferenceInput,
} from "@/domain/model/matching/intelligence";
import {
  createMatchingIntelligenceService,
  type MatchingIntelligenceService,
} from "@/domain/services/matching/intelligence";
import {
  createMatchingSocialService,
  mongoMatchingParticipantFencePort,
  mongoCandidateGrantValidationPort,
  type MatchingConnectionResult,
  type MatchingSocialEffectsPort,
} from "@/domain/services/matching/social";
import {
  getMatchingReadiness,
  loadOwnMatchingActualInput,
  loadDomainPreferenceProfiles,
  loadMatchingActualProfileSources,
  saveMatchingProfile,
  updateMatchingPreferenceProfile,
  type UpdatePreferenceInput,
} from "@/domain/services/matching/matchingProfileRuntime.service";
import { formPairInSession } from "@/domain/services/pairFormation.service";
import {
  getEventExpiresAt,
  getRetentionTier,
  type AuditEventName,
  type AuditRequestContext,
} from "@/lib/audit/eventTypes";
import { emitEvent } from "@/lib/audit/emitEvent";
import { connectToDatabase } from "@/lib/mongodb";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { EventLog } from "@/models/EventLog";
import {
  CandidatePresentationGrant,
  type CandidatePresentationGrantType,
} from "@/models/CandidatePresentationGrant";
import { Like, type CardSnapshot, type LikeType } from "@/models/Like";
import { MatchingBlock } from "@/models/MatchingBlock";
import {
  MatchingConnection,
  type MatchingConnectionType,
} from "@/models/MatchingConnection";
import {
  MatchingEvaluationSnapshot,
  type MatchingEvaluationSnapshotType,
} from "@/models/MatchingEvaluationSnapshot";
import { MatchingFeedSession } from "@/models/MatchingFeedSession";
import {
  MatchingProfile,
  type MatchingActualInput,
  type MatchingCard,
  type MatchingProfileType,
} from "@/models/MatchingProfile";
import { MatchingSocialEffect } from "@/models/MatchingSocialEffect";
import { Notification, type NotificationType } from "@/models/Notification";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import { User, type UserType } from "@/models/User";

const FEED_SESSION_TTL_MS = 15 * 60 * 1_000;
const CANDIDATE_GRANT_TTL_MS = 10 * 60 * 1_000;
const MATCHING_EVALUATION_TTL_MS = 24 * 60 * 60 * 1_000;
const MATCHING_EFFECT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;
const MATCHING_NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;
const ACTIVE_LIKE_STATUSES: LikeType["status"][] = [
  "SENT",
  "VIEWED",
  "RESPONDED",
  "MATCHED",
];

const SAFE_MATCHING_FACTOR_LABELS: Readonly<Record<string, string>> = {
  "communication.conflict.repairSkill": "Навык восстановления разговора",
  "sharedLife.planning.structurePreference": "Спонтанность и планирование",
  "lifePlans.family.childrenIntent": "Намерение относительно детей",
  "lifePlans.relationship.intent": "Намерение строить отношения",
  "sharedLife.lifestyle.socialActivityPreference": "Ритм социальной активности",
  "sharedLife.roles.cleaningPreference": "Предпочтение роли в уборке",
  "sharedLife.values.relationshipPriority": "Место отношений среди приоритетов",
};

type MatchUserDTO = { id: string; username: string; avatar: string; age?: number; city?: string };
type MatchPublicCardDTO = {
  requirements: [string, string, string];
  give?: [string, string, string];
  questions: MatchingAnswers;
  boundaries?: [string, string, string];
  boundaryDealbreakers?: [boolean, boolean, boolean];
  cardVersion?: 1 | 2;
};
type MatchFitDTO = {
  label: "PROMISING" | "WORKABLE" | "LOW_INFORMATION";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  explanations: string[];
};
type MatchAction = "RESPOND" | "ACCEPT" | "DECLINE" | "BLOCK" | "WITHDRAW";
type ConnectionAction = "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE";

export type MatchingConnectionDTO = {
  id: string;
  participant: MatchUserDTO;
  stage: "MATCHED" | "TALKING" | "DATING" | "COUPLE_CONFIRMED";
  status: "ACTIVE" | "PAUSED" | "CLOSED" | "BLOCKED";
  confirmation: {
    state: "NONE" | "PENDING" | "CONFIRMED";
    requestedByMe: boolean;
    confirmedByMe: boolean;
    confirmedByPartner: boolean;
  };
  pairId?: string;
  allowedActions: ConnectionAction[];
};

export type MatchLikeSummaryDTO = {
  id: string;
  status:
    | "SENT"
    | "VIEWED"
    | "RESPONDED"
    | "DECLINED"
    | "WITHDRAWN"
    | "EXPIRED"
    | "BLOCKED"
    | "MATCHED";
  role: "INITIATOR" | "RECIPIENT";
  peer: MatchUserDTO;
  allowedActions: MatchAction[];
  connectionId?: string;
  updatedAt?: string;
};

export type MatchLikeDetailDTO = MatchLikeSummaryDTO & {
  card?: MatchPublicCardDTO;
  questions?: MatchingAnswers;
  initiatorAnswers?: MatchingAnswers;
  initiatorReactions?: MatchingStatementReaction[];
  responseReactions?: MatchingStatementReaction[];
  initiatorCard?: MatchPublicCardDTO;
  targetCard?: MatchPublicCardDTO;
  responseAnswers?: MatchingAnswers;
  connection?: MatchingConnectionDTO;
};

export type MatchingFactorTarget =
  | { kind: "SCALAR_RANGE"; minimum: number; maximum: number }
  | { kind: "CATEGORICAL_SET"; allowedValues: string[] }
  | { kind: "CONSTRAINT_SET"; allowedValues: string[] }
  | {
      kind: "ROLE_TARGET";
      desiredPreferenceMinimum: number;
      desiredPreferenceMaximum: number;
    };

export type MatchingPreferenceTransport = {
  factorKey: string;
  target: MatchingFactorTarget;
  importance: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  flexibility: "FLEXIBLE" | "PREFER" | "IMPORTANT" | "NON_NEGOTIABLE";
  constraintMode: "NONE" | "SOFT" | "HARD";
  useAllowed: boolean;
};

export type MatchingCardTransport = MatchingCard & {
  soughtGender?: "ANY" | "male" | "female";
  ageRange: { min: number; max: number };
  maxDistanceKm: number;
  active: boolean;
  actual: Required<
    Pick<MatchingActualInput, "relationshipIntent" | "childrenIntent">
  > &
    Omit<MatchingActualInput, "relationshipIntent" | "childrenIntent">;
};

type StoredLike = LikeType & { _id: Types.ObjectId };
type StoredConnection = MatchingConnectionType & { _id: Types.ObjectId };
type DiscoveryCandidate = {
  userId: string;
  age: number;
  location: { type: "Point"; coordinates: [number, number] };
  publicCardRevision: number;
  actualProfileRevision: number;
  preferenceRevision: number;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const distanceKm = (
  left: readonly [number, number],
  right: readonly [number, number],
): number => {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const error = (code: string, status: number, message: string): never => {
  throw new DomainError({ code, status, message });
};

const asTuple3 = (values: readonly string[]): [string, string, string] => {
  if (values.length !== 3)
    return error(
      "MATCHING_DATA_INVALID",
      500,
      "Stored matching card is invalid",
    );
  return [values[0], values[1], values[2]];
};

const asTuple2 = (values: readonly string[]): MatchingAnswers => {
  if (values.length !== 2 && values.length !== 3)
    return error(
      "MATCHING_DATA_INVALID",
      500,
      "Stored matching answers are invalid",
    );
  return [...values] as MatchingAnswers;
};

const publicCard = (
  card: MatchingCard,
): MatchPublicCardDTO => ({
  requirements: asTuple3(card.requirements),
  give: asTuple3(card.give),
  questions: asTuple2(card.questions),
  ...(card.boundaries ? { boundaries: asTuple3(card.boundaries) } : {}),
  ...(card.boundaryDealbreakers ? { boundaryDealbreakers: card.boundaryDealbreakers } : {}),
  cardVersion: card.cardVersion ?? 1,
});

const snapshotCard = (snapshot: CardSnapshot): MatchPublicCardDTO => ({
  requirements: asTuple3(snapshot.requirements),
  ...(snapshot.give ? { give: asTuple3(snapshot.give) } : {}),
  questions: asTuple2(snapshot.questions),
  ...(snapshot.boundaries ? { boundaries: asTuple3(snapshot.boundaries) } : {}),
  ...(snapshot.boundaryDealbreakers ? { boundaryDealbreakers: snapshot.boundaryDealbreakers } : {}),
  cardVersion: snapshot.cardVersion ?? 1,
});

const userDTO = (
  user: Pick<UserType, "id" | "username" | "avatar"> & Partial<Pick<UserType, "personal">>,
): MatchUserDTO => ({
  id: user.id,
  username: user.username,
  avatar: user.avatar,
  ...(user.personal?.age && user.personal.age >= 18 ? { age: user.personal.age } : {}),
  ...(user.personal?.city?.trim() ? { city: user.personal.city.trim().slice(0, 120) } : {}),
});

const findUsers = async (
  ids: readonly string[],
): Promise<Map<string, MatchUserDTO>> => {
  const rows = await User.find({ id: { $in: [...new Set(ids)] } })
    .select({ id: 1, username: 1, avatar: 1, "personal.age": 1, "personal.city": 1 })
    .lean<Array<Pick<UserType, "id" | "username" | "avatar">>>();
  return new Map(rows.map((row) => [row.id, userDTO(row)]));
};

const nonEnumerableUser = (
  users: Map<string, MatchUserDTO>,
  id: string,
): MatchUserDTO =>
  users.get(id) ?? error("NOT_FOUND", 404, "Matching resource was not found");

const statusCanonical = (
  status: LikeType["status"],
): MatchLikeSummaryDTO["status"] => {
  if (
    status === "SENT" ||
    status === "VIEWED" ||
    status === "RESPONDED" ||
    status === "DECLINED" ||
    status === "EXPIRED" ||
    status === "WITHDRAWN" ||
    status === "BLOCKED" ||
    status === "MATCHED"
  ) {
    return status;
  }
  return error(
    "MATCHING_LEGACY_STATE_REQUIRES_MIGRATION",
    409,
    "Matching interaction requires migration",
  );
};

const likeActions = (
  like: StoredLike,
  currentUserId: string,
): MatchAction[] => {
  const role = like.fromId === currentUserId ? "INITIATOR" : "RECIPIENT";
  const status = statusCanonical(like.status);
  if (role === "RECIPIENT" && (status === "SENT" || status === "VIEWED")) {
    return ["RESPOND", "DECLINE", "BLOCK"];
  }
  if (role === "INITIATOR" && status === "RESPONDED") {
    return ["ACCEPT", "DECLINE", "BLOCK"];
  }
  if (role === "INITIATOR" && (status === "SENT" || status === "VIEWED")) return ["WITHDRAW", "BLOCK"];
  return status === "MATCHED" ? ["BLOCK"] : [];
};

const connectionActions = (
  connection: Pick<
    StoredConnection,
    "status" | "stage" | "pairId" | "coupleConfirmation"
  >,
  currentUserId: string,
): ConnectionAction[] => {
  if (connection.pairId) return [];
  if (connection.status === "PAUSED") return ["RESUME", "CLOSE"];
  if (connection.status !== "ACTIVE") return [];
  const requester = connection.coupleConfirmation.requestedBy;
  if (!requester) return ["REQUEST", "PAUSE", "CLOSE"];
  return requester === currentUserId ? ["CANCEL", "PAUSE", "CLOSE"] : ["CONFIRM", "CANCEL", "PAUSE", "CLOSE"];
};

const connectionDTO = async (
  connection: StoredConnection | MatchingConnectionResult,
  currentUserId: string,
): Promise<MatchingConnectionDTO> => {
  const ids =
    "participantIds" in connection
      ? connection.participantIds
      : error("MATCHING_DATA_INVALID", 500, "Stored connection is invalid");
  const partnerId = ids[0] === currentUserId ? ids[1] : ids[0];
  if (!partnerId || !ids.includes(currentUserId)) {
    return error("NOT_FOUND", 404, "Matching resource was not found");
  }
  const users = await findUsers([partnerId]);
  const confirmation =
    "coupleConfirmation" in connection
      ? connection.coupleConfirmation
      : connection.confirmation;
  const pairId = connection.pairId ? String(connection.pairId) : undefined;
  return {
    id:
      "connectionId" in connection
        ? connection.connectionId
        : String(connection._id),
    participant: nonEnumerableUser(users, partnerId),
    stage: connection.stage,
    status: connection.status,
    confirmation: {
      state:
        connection.stage === "COUPLE_CONFIRMED" || pairId
          ? "CONFIRMED"
          : confirmation.requestedBy
            ? "PENDING"
            : "NONE",
      requestedByMe: confirmation.requestedBy === currentUserId,
      confirmedByMe: confirmation.confirmedBy.includes(currentUserId),
      confirmedByPartner: confirmation.confirmedBy.includes(partnerId),
    },
    ...(pairId ? { pairId } : {}),
    allowedActions: connectionActions(
      {
        status: connection.status,
        stage: connection.stage,
        ...(pairId ? { pairId: new Types.ObjectId(pairId) } : {}),
        coupleConfirmation: {
          requestedBy: confirmation.requestedBy,
          requestedAt:
            confirmation.requestedAt instanceof Date
              ? confirmation.requestedAt
              : confirmation.requestedAt
                ? new Date(confirmation.requestedAt)
                : undefined,
          confirmedBy: [...confirmation.confirmedBy],
          revision: confirmation.revision,
        },
      },
      currentUserId,
    ),
  };
};

const toLikeSummary = (
  like: StoredLike,
  currentUserId: string,
  users: Map<string, MatchUserDTO>,
): MatchLikeSummaryDTO => {
  if (like.fromId !== currentUserId && like.toId !== currentUserId) {
    return error("NOT_FOUND", 404, "Matching resource was not found");
  }
  const initiator = like.fromId === currentUserId;
  const peerId = initiator ? like.toId : like.fromId;
  return {
    id: String(like._id),
    status: statusCanonical(like.status),
    role: initiator ? "INITIATOR" : "RECIPIENT",
    peer: nonEnumerableUser(users, peerId),
    allowedActions: likeActions(like, currentUserId),
    ...(like.connectionId ? { connectionId: String(like.connectionId) } : {}),
    ...(like.updatedAt ? { updatedAt: like.updatedAt.toISOString() } : {}),
  };
};

const likeDetail = async (
  like: StoredLike,
  currentUserId: string,
): Promise<MatchLikeDetailDTO> => {
  const users = await findUsers([like.fromId, like.toId]);
  const summary = toLikeSummary(like, currentUserId, users);
  if (like.status === "BLOCKED" || await MatchingBlock.exists({ participantKey: [like.fromId, like.toId].sort().join("|"), status: "ACTIVE" })) return { ...summary, allowedActions: [] };
  const snapshot =
    summary.role === "RECIPIENT"
      ? like.fromCardSnapshot
      : like.targetCardSnapshot;
  const card = snapshot ? snapshotCard(snapshot) : undefined;
  const connection = like.connectionId
    ? await MatchingConnection.findOne({
        _id: like.connectionId,
        participantIds: currentUserId,
      }).lean<StoredConnection | null>()
    : null;
  return {
    ...summary,
    ...(like.fromCardSnapshot ? { initiatorCard: snapshotCard(like.fromCardSnapshot) } : {}),
    ...(like.targetCardSnapshot ? { targetCard: snapshotCard(like.targetCardSnapshot) } : {}),
    ...(like.reactions ? { initiatorReactions: like.reactions } : {}),
    ...(like.recipientResponse?.reactions ? { responseReactions: like.recipientResponse.reactions } : {}),
    ...(card ? { card, questions: card.questions } : {}),
    ...(like.answers ? { initiatorAnswers: asTuple2(like.answers) } : {}),
    ...(like.recipientResponse?.answers
      ? { responseAnswers: asTuple2(like.recipientResponse.answers) }
      : {}),
    ...(connection
      ? { connection: await connectionDTO(connection, currentUserId) }
      : {}),
  };
};

type TransactionalMatchingAudit = {
  suffix: string;
  event: AuditEventName;
  context?: { pairId?: string; likeId?: string };
  target?: { type: "like" | "user" | "system" | "pair"; id: string };
  metadata: Record<string, string | number | boolean>;
};

const matchingAuditRows = (
  input: Parameters<MatchingSocialEffectsPort["record"]>[0],
): readonly TransactionalMatchingAudit[] => {
  const peerId = input.participantIds.find((id) => id !== input.actorId);
  switch (input.name) {
    case "LIKE_CREATED":
      return [
        {
          suffix: "like-created",
          event: "MATCH_LIKE_CREATED",
          context: { likeId: input.resourceId },
          target: { type: "like", id: input.resourceId },
          metadata: { likeId: input.resourceId, status: "SENT" },
        },
      ];
    case "LIKE_RESPONDED":
      return [
        {
          suffix: "like-responded",
          event: "MATCH_RESPONDED",
          context: { likeId: input.resourceId },
          target: { type: "like", id: input.resourceId },
          metadata: { likeId: input.resourceId, status: "RESPONDED" },
        },
      ];
    case "LIKE_ACCEPTED":
      return [
        {
          suffix: "like-accepted",
          event: "MATCH_ACCEPTED",
          context: { likeId: input.resourceId },
          target: { type: "like", id: input.resourceId },
          metadata: { likeId: input.resourceId, status: "MATCHED" },
        },
      ];
    case "LIKE_DECLINED":
      return [
        {
          suffix: "like-declined",
          event: "MATCH_REJECTED",
          context: { likeId: input.resourceId },
          target: { type: "like", id: input.resourceId },
          metadata: { likeId: input.resourceId, status: "DECLINED" },
        },
      ];
    case "MATCHING_BLOCKED":
      return peerId
        ? [
            {
              suffix: "participant-blocked",
              event: "MATCH_USER_BLOCKED",
              target: { type: "user", id: peerId },
              metadata: { blockedUserId: peerId },
            },
          ]
        : [];
    case "MATCHING_UNBLOCKED":
      return peerId
        ? [
            {
              suffix: "participant-unblocked",
              event: "MATCH_USER_UNBLOCKED",
              target: { type: "user", id: peerId },
              metadata: { unblockedUserId: peerId },
            },
          ]
        : [];
    case "COUPLE_CONFIRMATION_REQUESTED":
    case "COUPLE_CONFIRMATION_CONFIRMED":
    case "COUPLE_CONFIRMATION_CANCELLED": {
      const action =
        input.name === "COUPLE_CONFIRMATION_REQUESTED"
          ? "REQUEST"
          : input.name === "COUPLE_CONFIRMATION_CONFIRMED"
            ? "CONFIRM"
            : "CANCEL";
      return [
        {
          suffix: `confirmation-${action.toLowerCase()}`,
          event: "MATCH_CONNECTION_CONFIRMATION_CHANGED",
          target: { type: "system", id: input.resourceId },
          metadata: { connectionId: input.resourceId, action },
        },
      ];
    }
    case "PAIR_FORMED_FROM_MATCHING":
      return input.pairId
        ? [
            {
              suffix: "match-confirmed",
              event: "MATCH_CONFIRMED",
              context: { pairId: input.pairId },
              target: { type: "pair", id: input.pairId },
              metadata: {
                connectionId: input.resourceId,
                pairId: input.pairId,
              },
            },
            {
              suffix: "pair-created",
              event: "PAIR_CREATED",
              context: { pairId: input.pairId },
              target: { type: "pair", id: input.pairId },
              metadata: { pairId: input.pairId, source: "match_confirm" },
            },
          ]
        : [];
    case "LIKE_VIEWED":
    case "CONNECTION_CREATED":
      return [];
  }
};

const socialEffects: MatchingSocialEffectsPort = {
  async record(input) {
    await MatchingSocialEffect.updateOne(
      { effectKey: input.effectKey },
      {
        $setOnInsert: {
          effectKey: input.effectKey,
          name: input.name,
          actorId: input.actorId,
          participantIds: [...input.participantIds],
          resourceId: input.resourceId,
          occurredAt: input.now,
          expiresAt: new Date(
            input.now.getTime() + MATCHING_EFFECT_RETENTION_MS,
          ),
        },
      },
      { upsert: true, session: input.session },
    );

    for (const audit of matchingAuditRows(input)) {
      const ts = input.now.getTime();
      const eventKey = sha256(
        JSON.stringify(["matching-audit-v1", input.effectKey, audit.suffix]),
      );
      await EventLog.updateOne(
        { eventKey },
        {
          $setOnInsert: {
            eventKey,
            event: audit.event,
            ts,
            actor: { userId: input.actorId },
            ...(audit.context ? { context: audit.context } : {}),
            ...(audit.target ? { target: audit.target } : {}),
            request: input.auditRequest ?? {
              route: "/api/match",
              method: "POST",
            },
            metadata: audit.metadata,
            retentionTier: getRetentionTier(audit.event),
            expiresAt: getEventExpiresAt(audit.event, ts),
          },
        },
        { upsert: true, session: input.session },
      );
    }

    const notificationTypeByEffect: Partial<
      Record<typeof input.name, NotificationType>
    > = {
      LIKE_CREATED: "MATCH_LIKE_RECEIVED",
      LIKE_RESPONDED: "MATCH_LIKE_RESPONDED",
      CONNECTION_CREATED: "MATCH_CONNECTED",
      COUPLE_CONFIRMATION_REQUESTED: "MATCH_CONFIRMATION_REQUESTED",
    };
    const notificationType = notificationTypeByEffect[input.name];
    const recipientId = input.participantIds.find(
      (participantId) => participantId !== input.actorId,
    );
    if (notificationType && recipientId) {
      const dedupeKey = sha256(
        JSON.stringify([
          "matching-notification-v1",
          recipientId,
          input.effectKey,
        ]),
      );
      await Notification.updateOne(
        { userId: recipientId, dedupeKey },
        {
          $setOnInsert: {
            userId: recipientId,
            resourceId: input.resourceId,
            type: notificationType,
            dedupeKey,
            expiresAt: new Date(
              input.now.getTime() + MATCHING_NOTIFICATION_RETENTION_MS,
            ),
          },
        },
        { upsert: true, session: input.session },
      );
    }
  },
};

const socialService = createMatchingSocialService({
  candidateGrants: mongoCandidateGrantValidationPort,
  participantFence: mongoMatchingParticipantFencePort,
  pairFormation: {
    async formFromMatchingConnection(input) {
      return formPairInSession({
        source: "MATCHING_CONNECTION",
        sourceId: input.connectionId,
        members: [input.participantIds[0], input.participantIds[1]],
        now: input.now,
        session: input.session,
      });
    },
  },
  effects: socialEffects,
});

const matchingIntelligenceForSession = (
  session: ClientSession,
): MatchingIntelligenceService =>
  createMatchingIntelligenceService({
    async loadPublishedRegistry() {
      return MVP_FACTOR_REGISTRY;
    },
    async loadActualProfileSources(input) {
      return loadMatchingActualProfileSources({
        ownerIds: input.ownerIds,
        session,
      });
    },
    async loadPreferenceProfiles(input) {
      if (
        input.registryKey !== MVP_FACTOR_REGISTRY.registryKey ||
        input.registryVersion !== MVP_FACTOR_REGISTRY.registryVersion
      ) {
        return [];
      }
      return loadDomainPreferenceProfiles({
        ownerIds: input.ownerIds,
        session,
      });
    },
  });

const withMatchingIntelligenceSnapshot = async <Result>(
  operation: (service: MatchingIntelligenceService) => Promise<Result>,
): Promise<Result> => {
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(
      () => operation(matchingIntelligenceForSession(session)),
      { readConcern: { level: "snapshot" } },
    );
    if (result === undefined) {
      return error(
        "MATCHING_EVALUATION_UNAVAILABLE",
        503,
        "Matching evaluation did not complete",
      );
    }
    return result;
  } finally {
    await session.endSession();
  }
};

const qualitativeFit = (evaluation: MatchingEvaluation): MatchFitDTO => {
  const projected = projectMatchingCandidateIntelligence(evaluation);
  const score = evaluation.ranking.confidenceAdjustedScore01;
  return {
    label:
      score === undefined || evaluation.coverage < 0.45
        ? "LOW_INFORMATION"
        : score >= 0.72
          ? "PROMISING"
          : "WORKABLE",
    confidence: projected.confidenceBand,
    explanations: projected.explanations.map(explanationText).slice(0, 3),
  };
};

const explanationText = (explanation: MatchingExplanation): string => {
  switch (explanation.tone) {
    case "ALIGNED":
      return "Важный для вас ритм выглядит согласованным";
    case "COMPLEMENTARY":
      return "Ваши сильные стороны могут хорошо дополнять друг друга";
    case "WORKABLE_DIFFERENCE":
      return "Есть различие, которое полезно обсудить заранее";
  }
};

const outputHashForEvaluation = (evaluation: MatchingEvaluation): string =>
  sha256(
    JSON.stringify({
      evaluationId: evaluation.evaluationId,
      inputHash: evaluation.inputHash,
      eligibility: evaluation.eligibility.status,
      ranking: evaluation.ranking.confidenceAdjustedScore01,
      confidence: evaluation.confidence,
      coverage: evaluation.coverage,
      factors: evaluation.factorResults.map((factor) => ({
        factorKey: factor.factorKey,
        hardConflict: factor.hardConflict,
        contribution: factor.contribution,
        confidence: factor.confidence,
        reasons: factor.reasonCodes,
      })),
    }),
  );

const evaluationPersistenceUpdate = (
  evaluation: MatchingEvaluation,
  now: Date,
): UpdateQuery<MatchingEvaluationSnapshotType> => ({
  $setOnInsert: {
    evaluationId: evaluation.evaluationId,
    requesterId: evaluation.requesterId,
    candidateId: evaluation.candidateId,
    ...(evaluation.requesterExpectationFit.fit === undefined
      ? {}
      : { requesterExpectationFit: evaluation.requesterExpectationFit.fit }),
    ...(evaluation.candidateExpectationFit.fit === undefined
      ? {}
      : { candidateExpectationFit: evaluation.candidateExpectationFit.fit }),
    ...(evaluation.mutualFactorFit.fit === undefined
      ? {}
      : { mutualFactorFit: evaluation.mutualFactorFit.fit }),
    eligible: evaluation.eligibility.eligible,
    eligibilityReasonCode: evaluation.eligibility.status,
    ...(evaluation.ranking.confidenceAdjustedScore01 === undefined
      ? {}
      : { rankingScore: evaluation.ranking.confidenceAdjustedScore01 }),
    confidence: evaluation.confidence,
    coverage: evaluation.coverage,
    factorResults: evaluation.factorResults.map((factor) => ({
      factorKey: factor.factorKey,
      status: factor.hardConflict
        ? "HARD_CONFLICT"
        : factor.mutualFactorFit.status === "UNAVAILABLE"
          ? "INSUFFICIENT_DATA"
          : factor.mutualFactorFit.pairEvaluation?.status === "COMPLEMENTARY"
            ? "COMPLEMENTARY"
            : factor.mutualFactorFit.pairEvaluation?.status === "ALIGNED"
              ? "ALIGNED"
              : "WORKABLE_DIFFERENCE",
      ...(factor.requesterExpectationFit.fit === undefined
        ? {}
        : { requesterFit: factor.requesterExpectationFit.fit }),
      ...(factor.candidateExpectationFit.fit === undefined
        ? {}
        : { candidateFit: factor.candidateExpectationFit.fit }),
      ...(factor.mutualFactorFit.fit === undefined
        ? {}
        : { mutualFit: factor.mutualFactorFit.fit }),
      confidence: factor.confidence,
      coverage:
        factor.contribution === undefined || factor.rankingWeight === 0 ? 0 : 1,
      ...(factor.contribution === undefined
        ? {}
        : { rankingContribution: factor.contribution }),
      reasonCode: factor.reasonCodes[0] ?? "INSUFFICIENT_DATA",
    })),
    explanationKeys: evaluation.explanations.map((item) => item.key),
    versions: {
      registryHash: evaluation.versions.registryHash,
      registryVersion: evaluation.versions.registryVersion,
      algorithmVersion: evaluation.versions.algorithmVersion,
      requesterActualRevision: evaluation.versions.requesterActualRevision,
      candidateActualRevision: evaluation.versions.candidateActualRevision,
      requesterPreferenceRevision:
        evaluation.versions.requesterPreferenceRevision,
      candidatePreferenceRevision:
        evaluation.versions.candidatePreferenceRevision,
      requesterActualInputHash: evaluation.versions.requesterActualInputHash,
      candidateActualInputHash: evaluation.versions.candidateActualInputHash,
      requesterPreferenceInputHash:
        evaluation.versions.requesterPreferenceInputHash,
      candidatePreferenceInputHash:
        evaluation.versions.candidatePreferenceInputHash,
    },
    inputHash: evaluation.inputHash,
    outputHash: outputHashForEvaluation(evaluation),
    calculatedAt: evaluation.calculatedAt,
    expiresAt: new Date(now.getTime() + MATCHING_EVALUATION_TTL_MS),
  },
});

const persistEvaluations = async (
  evaluations: readonly MatchingEvaluation[],
  now: Date,
): Promise<void> => {
  if (evaluations.length === 0) return;
  try {
    await MatchingEvaluationSnapshot.bulkWrite(
      evaluations.map((evaluation) => ({
        updateOne: {
          filter: { evaluationId: evaluation.evaluationId },
          update: evaluationPersistenceUpdate(evaluation, now),
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (caught) {
    const duplicate = caught as Error & { code?: number };
    if (duplicate.code !== 11000) throw caught;
    const canonicalCount = await MatchingEvaluationSnapshot.countDocuments({
      evaluationId: {
        $in: evaluations.map((evaluation) => evaluation.evaluationId),
      },
    });
    if (canonicalCount !== evaluations.length) throw caught;
  }
};

const encodeFeedCursor = (rawToken: string, offset: number): string =>
  Buffer.from(`${rawToken}.${offset}`, "utf8").toString("base64url");

const decodeFeedCursor = (
  cursor: string,
): { rawToken: string; offset: number } => {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf(".");
    const rawToken = decoded.slice(0, separator);
    const offset = Number(decoded.slice(separator + 1));
    if (
      rawToken.length < 32 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 200
    ) {
      return error(
        "MATCHING_CURSOR_INVALID",
        400,
        "Matching cursor is invalid",
      );
    }
    return { rawToken, offset };
  } catch {
    return error("MATCHING_CURSOR_INVALID", 400, "Matching cursor is invalid");
  }
};

type CandidateGrantIssueInput = {
  requester: MatchingProfileType;
  candidate: MatchingProfileType;
  evaluation: MatchingEvaluation;
  now: Date;
};

type CandidateGrantIssueResult = {
  grants: Map<string, string>;
  candidates: Map<string, MatchingProfileType>;
};

const grantCandidates = async (
  inputs: readonly CandidateGrantIssueInput[],
): Promise<CandidateGrantIssueResult> => {
  if (inputs.length === 0) {
    return { grants: new Map(), candidates: new Map() };
  }
  const requesterId = inputs[0]?.requester.userId;
  if (
    !requesterId ||
    inputs.some((input) => input.requester.userId !== requesterId)
  ) {
    return error(
      "MATCHING_GRANT_INPUT_INVALID",
      500,
      "Candidate grant batch is invalid",
    );
  }
  const candidateIds = [
    ...new Set(inputs.map((input) => input.candidate.userId)),
  ];
  const participantIds = [requesterId, ...candidateIds];
  const participantKeys = candidateIds.map((candidateId) =>
    [requesterId, candidateId].sort().join("|"),
  );
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      // This shared write fence serializes grant disclosure against profile,
      // block, social-interaction and Pair mutations for every participant.
      const fenced = await User.updateMany(
        { id: { $in: participantIds } },
        { $inc: { pairMembershipRevision: 1 } },
        { session },
      );
      if (fenced.matchedCount !== participantIds.length) {
        return error(
          "MATCHING_GRANT_ISSUE_FAILED",
          409,
          "Candidate presentation changed",
        );
      }

      // MongoDB does not support parallel operations on one transaction/session.
      const profiles = await MatchingProfile.find({
        userId: { $in: participantIds },
        active: true,
        requiredDataReady: true,
      })
        .session(session)
        .lean<MatchingProfileType[]>();
      const projections = await CandidateDiscoveryProjection.find({
        userId: { $in: participantIds },
        active: true,
        requiredDataReady: true,
        location: { $exists: true },
      })
        .session(session)
        .lean<DiscoveryCandidate[]>();
      const blocks = await MatchingBlock.find({
        participantKey: { $in: participantKeys },
        status: "ACTIVE",
      })
        .select({ participantKey: 1 })
        .session(session)
        .lean<Array<{ participantKey: string }>>();
      const memberships = await PairMembershipClaim.find({
        userId: { $in: participantIds },
      })
        .select({ userId: 1 })
        .session(session)
        .lean<Array<{ userId: string }>>();
      const connections = await MatchingConnection.find({
        participantKey: { $in: participantKeys },
        status: { $in: ["ACTIVE", "PAUSED"] },
      })
        .select({ participantKey: 1 })
        .session(session)
        .lean<Array<{ participantKey: string }>>();
      const interactions = await Like.find({
        $and: [
          {
            $or: [
              { fromId: requesterId, toId: { $in: candidateIds } },
              { fromId: { $in: candidateIds }, toId: requesterId },
            ],
          },
          {
            $or: [
              { status: { $in: ACTIVE_LIKE_STATUSES } },
              { status: "DECLINED", declinedUntil: { $gt: inputs[0]?.now } },
            ],
          },
        ],
      })
        .select({ fromId: 1, toId: 1 })
        .session(session)
        .lean<Array<Pick<LikeType, "fromId" | "toId">>>();

      const profileById = new Map(
        profiles.map((profile) => [profile.userId, profile]),
      );
      const projectionById = new Map(
        projections.map((projection) => [projection.userId, projection]),
      );
      const excludedKeys = new Set([
        ...blocks.map((row) => row.participantKey),
        ...connections.map((row) => row.participantKey),
      ]);
      const excludedIds = new Set([
        ...memberships.map((row) => row.userId),
        ...interactions.map((row) =>
          row.fromId === requesterId ? row.toId : row.fromId,
        ),
      ]);
      const requester = profileById.get(requesterId);
      const requesterProjection = projectionById.get(requesterId);
      const expectedRequester = inputs[0]?.requester;
      if (
        !requester ||
        !requesterProjection?.location ||
        excludedIds.has(requesterId) ||
        !expectedRequester ||
        requester.publicCardRevision !== expectedRequester.publicCardRevision ||
        requester.actualProfileRevision !==
          expectedRequester.actualProfileRevision ||
        requester.preferenceRevision !== expectedRequester.preferenceRevision
      ) {
        return error(
          "MATCHING_PROFILE_CHANGED",
          409,
          "Matching profile changed; refresh the feed",
        );
      }

      const eligible = inputs.filter((input) => {
        const candidate = profileById.get(input.candidate.userId);
        const candidateProjection = projectionById.get(input.candidate.userId);
        const key = [requesterId, input.candidate.userId].sort().join("|");
        const versions = input.evaluation.versions;
        if (
          !candidate ||
          !candidateProjection?.location ||
          excludedIds.has(input.candidate.userId) ||
          excludedKeys.has(key) ||
          candidate.publicCardRevision !== input.candidate.publicCardRevision ||
          candidate.actualProfileRevision !==
            input.candidate.actualProfileRevision ||
          candidate.preferenceRevision !== input.candidate.preferenceRevision ||
          requesterProjection.publicCardRevision !==
            requester.publicCardRevision ||
          candidateProjection.publicCardRevision !==
            candidate.publicCardRevision ||
          requesterProjection.actualProfileRevision !==
            requester.actualProfileRevision ||
          candidateProjection.actualProfileRevision !==
            candidate.actualProfileRevision ||
          requesterProjection.preferenceRevision !==
            requester.preferenceRevision ||
          candidateProjection.preferenceRevision !==
            candidate.preferenceRevision ||
          input.evaluation.requesterId !== requesterId ||
          input.evaluation.candidateId !== candidate.userId ||
          versions.registryKey !== MVP_FACTOR_REGISTRY.registryKey ||
          versions.registryVersion !== MVP_FACTOR_REGISTRY.registryVersion ||
          versions.registryHash !== MVP_FACTOR_REGISTRY.hash ||
          versions.algorithmVersion !== MVP_FACTOR_REGISTRY.algorithmVersion ||
          versions.requesterActualRevision !==
            requester.actualProfileRevision ||
          versions.candidateActualRevision !==
            candidate.actualProfileRevision ||
          versions.requesterPreferenceRevision !==
            requester.preferenceRevision ||
          versions.candidatePreferenceRevision !==
            candidate.preferenceRevision ||
          candidateProjection.age < requester.desiredAgeRange.min ||
          candidateProjection.age > requester.desiredAgeRange.max ||
          requesterProjection.age < candidate.desiredAgeRange.min ||
          requesterProjection.age > candidate.desiredAgeRange.max ||
          distanceKm(
            requesterProjection.location.coordinates,
            candidateProjection.location.coordinates,
          ) > Math.min(requester.maxDistanceKm, candidate.maxDistanceKm)
        ) {
          return false;
        }
        return true;
      });
      const issued = eligible.map((input) => ({
        input,
        requester,
        candidate: profileById.get(
          input.candidate.userId,
        ) as MatchingProfileType,
        token: randomBytes(32).toString("base64url"),
      }));
      if (issued.length > 0) {
        await CandidatePresentationGrant.insertMany(
          issued.map(
            ({ input, requester: currentRequester, candidate, token }) => ({
              tokenHash: sha256(token),
              requesterId,
              candidateId: candidate.userId,
              evaluationId: input.evaluation.evaluationId,
              requesterProfileRevision: currentRequester.actualProfileRevision,
              candidateProfileRevision: candidate.actualProfileRevision,
              requesterCardRevision: currentRequester.publicCardRevision,
              candidateCardRevision: candidate.publicCardRevision,
              requesterPreferenceRevision: currentRequester.preferenceRevision,
              candidatePreferenceRevision: candidate.preferenceRevision,
              registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
              algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
              expiresAt: new Date(input.now.getTime() + CANDIDATE_GRANT_TTL_MS),
            }),
          ),
          { ordered: true, session },
        );
      }
      return {
        grants: new Map(
          issued.map(({ candidate, token }) => [candidate.userId, token]),
        ),
        candidates: new Map(
          issued.map(({ candidate }) => [candidate.userId, candidate]),
        ),
      } satisfies CandidateGrantIssueResult;
    });
    return (
      result ??
      error(
        "MATCHING_GRANT_ISSUE_FAILED",
        503,
        "Candidate grant transaction did not complete",
      )
    );
  } finally {
    await session.endSession();
  }
};

const candidateGrantLookup = async (input: {
  currentUserId: string;
  candidateId: string;
  token: string;
  now?: Date;
  session?: ClientSession;
}): Promise<CandidatePresentationGrantType> => {
  const now = input.now ?? new Date();
  const grant = await CandidatePresentationGrant.findOne({
    tokenHash: sha256(input.token),
    requesterId: input.currentUserId,
    candidateId: input.candidateId,
    expiresAt: { $gt: now },
    revokedAt: { $exists: false },
  })
    .select("+tokenHash")
    .session(input.session ?? null)
    .lean<CandidatePresentationGrantType | null>();
  if (!grant) {
    return error("NOT_FOUND", 404, "Matching resource was not found");
  }
  const participantKey = [input.currentUserId, input.candidateId]
    .sort()
    .join("|");
  const profiles = await MatchingProfile.find({
    userId: { $in: [input.currentUserId, input.candidateId] },
    active: true,
    requiredDataReady: true,
  })
    .session(input.session ?? null)
    .lean<MatchingProfileType[]>();
  const projections = await CandidateDiscoveryProjection.find({
    userId: { $in: [input.currentUserId, input.candidateId] },
    active: true,
    requiredDataReady: true,
    location: { $exists: true },
  })
    .session(input.session ?? null)
    .lean<DiscoveryCandidate[]>();
  const blocked = await MatchingBlock.exists({
    participantKey,
    status: "ACTIVE",
  }).session(input.session ?? null);
  const occupied = await PairMembershipClaim.exists({
    userId: { $in: [input.currentUserId, input.candidateId] },
  }).session(input.session ?? null);
  const connected = await MatchingConnection.exists({
    participantKey,
    status: { $in: ["ACTIVE", "PAUSED"] },
  }).session(input.session ?? null);
  const declined = await Like.exists({
    $or: [
      { fromId: input.currentUserId, toId: input.candidateId },
      { fromId: input.candidateId, toId: input.currentUserId },
    ],
    status: "DECLINED",
    declinedUntil: { $gt: now },
  }).session(input.session ?? null);
  const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
  const projectionById = new Map(
    projections.map((projection) => [projection.userId, projection]),
  );
  const requester = byId.get(input.currentUserId);
  const candidate = byId.get(input.candidateId);
  const requesterProjection = projectionById.get(input.currentUserId);
  const candidateProjection = projectionById.get(input.candidateId);
  const people = await loadMatchingPeople([input.currentUserId, input.candidateId], input.session);
  const mutuallyEligible = Boolean(
    mutualMatchingGenderEligible(people.get(input.currentUserId), people.get(input.candidateId), requester, candidate) &&
    requester &&
    candidate &&
    requesterProjection?.location &&
    candidateProjection?.location &&
    candidateProjection.age >= requester.desiredAgeRange.min &&
    candidateProjection.age <= requester.desiredAgeRange.max &&
    requesterProjection.age >= candidate.desiredAgeRange.min &&
    requesterProjection.age <= candidate.desiredAgeRange.max &&
    distanceKm(
      requesterProjection.location.coordinates,
      candidateProjection.location.coordinates,
    ) <= Math.min(requester.maxDistanceKm, candidate.maxDistanceKm),
  );
  if (
    !requester ||
    !candidate ||
    blocked ||
    occupied ||
    connected ||
    declined ||
    !mutuallyEligible ||
    requester.actualProfileRevision !== grant.requesterProfileRevision ||
    candidate.actualProfileRevision !== grant.candidateProfileRevision ||
    requester.publicCardRevision !== grant.requesterCardRevision ||
    candidate.publicCardRevision !== grant.candidateCardRevision ||
    requester.preferenceRevision !== grant.requesterPreferenceRevision ||
    candidate.preferenceRevision !== grant.candidatePreferenceRevision ||
    grant.registryVersion !== MVP_FACTOR_REGISTRY.registryVersion ||
    grant.algorithmVersion !== MVP_FACTOR_REGISTRY.algorithmVersion
  ) {
    return error(
      "CANDIDATE_GRANT_UNAVAILABLE",
      409,
      "Candidate presentation is no longer available",
    );
  }
  return grant;
};

export async function getOwnMatchingCard(input: { currentUserId: string }) {
  await connectToDatabase();
  const [profile, readiness, actual] = await Promise.all([
    MatchingProfile.findOne({
      userId: input.currentUserId,
    }).lean<MatchingProfileType | null>(),
    getMatchingReadiness(input.currentUserId),
    loadOwnMatchingActualInput(input.currentUserId),
  ]);
  if (!profile) {
    return {
      card: null,
      revision: 0,
      requiredDataReady: false,
      missingRequiredTopics: readiness.missing,
    };
  }
  return {
    card: {
      ...publicCard(profile.card),
      soughtGender: profile.soughtGender ?? "ANY",
      ageRange: profile.desiredAgeRange,
      maxDistanceKm: profile.maxDistanceKm,
      active: profile.active,
      actual,
    },
    revision: profile.publicCardRevision,
    requiredDataReady: readiness.ready,
    missingRequiredTopics: readiness.missing,
  };
}

export async function saveOwnMatchingCard(input: {
  currentUserId: string;
  card: MatchingCardTransport;
  idempotencyKey: string;
  auditRequest: AuditRequestContext;
}) {
  const saved = await saveMatchingProfile({
    ownerId: input.currentUserId,
    card: {
      requirements: input.card.requirements,
      give: input.card.give,
      questions: input.card.questions,
      boundaries: input.card.boundaries,
      boundaryDealbreakers: input.card.boundaryDealbreakers,
      cardVersion: 2,
    },
    actual: input.card.actual,
    soughtGender: input.card.soughtGender ?? "ANY",
    desiredAgeRange: input.card.ageRange,
    maxDistanceKm: input.card.maxDistanceKm,
    discoveryRequested: input.card.active,
    operationKey: input.idempotencyKey,
  });
  await emitEvent({
    eventKey: sha256(
      JSON.stringify([
        "matching-card-audit-v1",
        input.currentUserId,
        input.idempotencyKey,
      ]),
    ),
    event: "MATCH_CARD_UPDATED",
    actor: { userId: input.currentUserId },
    target: { type: "user", id: input.currentUserId },
    request: input.auditRequest,
    metadata: {
      userId: input.currentUserId,
      isActive: saved.profile.active,
      requirementsCount: 3,
      questionsCount: 3,
    },
  });
  return getOwnMatchingCard({ currentUserId: input.currentUserId });
}

export async function getMatchingPreferences(input: { currentUserId: string }) {
  await connectToDatabase();
  const [profiles, grants] = await Promise.all([
    loadDomainPreferenceProfiles({ ownerIds: [input.currentUserId] }),
    loadMatchingActualProfileSources({ ownerIds: [input.currentUserId] }),
  ]);
  const profile = profiles[0];
  const grantByFactor = new Map(
    (grants[0]?.grants ?? []).map((grant) => [grant.factorKey, grant.allowed]),
  );
  const definitionByKey = new Map(
    MVP_FACTOR_REGISTRY.factors.map((definition) => [
      definition.key,
      definition,
    ]),
  );
  const storedByFactor = new Map(
    (profile?.preferences ?? []).map((preference) => [
      preference.factorKey,
      preference,
    ]),
  );
  const templateTarget = (
    factorKey: string,
  ): PartnerPreferenceInput["desiredValue"] => {
    const definition = definitionByKey.get(factorKey);
    if (!definition) {
      return error(
        "MATCHING_DEFINITION_MISSING",
        500,
        "Matching factor is not published",
      );
    }
    const schema = definition.valueSchema;
    if (schema.type === "CONSTRAINT") {
      return {
        kind: "CONSTRAINT_SET",
        allowedValues: [...schema.allowedValues],
      };
    }
    if (schema.type === "CATEGORY") {
      return {
        kind: "CATEGORICAL_SET",
        allowedValues: [...schema.allowedValues],
      };
    }
    if (schema.type === "ORDINAL") {
      return {
        kind: "CATEGORICAL_SET",
        allowedValues: schema.levels.map((level) => level.value),
      };
    }
    if (schema.type === "SCALAR" || schema.type === "RANGE") {
      return { kind: "SCALAR_RANGE", minimum: schema.min, maximum: schema.max };
    }
    if (schema.type === "MASTERY") {
      return { kind: "SCALAR_RANGE", minimum: 0, maximum: 1 };
    }
    if (schema.type === "BOOLEAN") {
      return { kind: "CATEGORICAL_SET", allowedValues: ["true", "false"] };
    }
    return { kind: "CATEGORICAL_SET", allowedValues: [] };
  };
  const catalog = MVP_FACTOR_REGISTRY.factors.filter(
    (definition) => definition.matchingPolicy?.enabled === true,
  );
  return {
    revision: profile?.revision ?? 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    preferences: catalog.map((definition) => {
      const stored = storedByFactor.get(definition.key);
      return {
        factorKey: definition.key,
        label: SAFE_MATCHING_FACTOR_LABELS[definition.key] ?? definition.key,
        target: stored?.desiredValue ?? templateTarget(definition.key),
        importance:
          stored?.importance ??
          definition.matchingPolicy?.defaultImportance ??
          "MEDIUM",
        flexibility: stored?.flexibility ?? "FLEXIBLE",
        constraintMode: stored?.constraintMode ?? "NONE",
        useAllowed: grantByFactor.get(definition.key) === true,
        hardAllowed: definition.matchingPolicy?.canBeHardConstraint === true,
      };
    }),
  };
}

export async function updateMatchingPreferences(input: {
  currentUserId: string;
  revision: number;
  preferences: MatchingPreferenceTransport[];
  idempotencyKey: string;
  auditRequest: AuditRequestContext;
}) {
  const preferences: UpdatePreferenceInput[] = input.preferences.map(
    (preference) => ({
      factorKey: preference.factorKey,
      desiredValue: preference.target as PartnerPreferenceInput["desiredValue"],
      importance: preference.importance,
      flexibility: preference.flexibility,
      constraintMode: preference.constraintMode,
      useAllowed: preference.useAllowed,
    }),
  );
  const updated = await updateMatchingPreferenceProfile({
    ownerId: input.currentUserId,
    expectedRevision: input.revision,
    preferences,
    operationKey: input.idempotencyKey,
  });
  await emitEvent({
    eventKey: sha256(
      JSON.stringify([
        "matching-preferences-audit-v1",
        input.currentUserId,
        input.idempotencyKey,
      ]),
    ),
    event: "MATCH_PREFERENCES_UPDATED",
    actor: { userId: input.currentUserId },
    target: { type: "user", id: input.currentUserId },
    request: input.auditRequest,
    metadata: {
      revision: updated.preferences.revision,
      factorCount: updated.preferences.preferences.length,
    },
  });
  return getMatchingPreferences({ currentUserId: input.currentUserId });
}

export async function getMatchingFeed(input: {
  currentUserId: string;
  cursor?: string;
  limit: number;
}) {
  await connectToDatabase();
  await expireMatchingRequests(input.currentUserId);
  await assertMatchingSolo([input.currentUserId]);
  const now = new Date();
  const requester = await MatchingProfile.findOne({
    userId: input.currentUserId,
    active: true,
    requiredDataReady: true,
  }).lean<MatchingProfileType | null>();
  if (!requester) {
    return error(
      "MATCHING_PROFILE_INACTIVE",
      409,
      "Complete and activate your matching profile",
    );
  }
  if (await PairMembershipClaim.exists({ userId: input.currentUserId })) {
    return error(
      "PAIR_ALREADY_ACTIVE",
      409,
      "Matching is unavailable while a pair is active",
    );
  }

  let rawToken: string;
  let offset: number;
  let candidateIds: string[];
  let initialEvaluationsByCandidate:
    Map<string, MatchingEvaluation> | undefined;
  if (input.cursor) {
    const decoded = decodeFeedCursor(input.cursor);
    rawToken = decoded.rawToken;
    offset = decoded.offset;
    const session = await MatchingFeedSession.findOne({
      tokenHash: sha256(rawToken),
      requesterId: input.currentUserId,
      requesterProfileRevision: requester.actualProfileRevision,
      requesterPreferenceRevision: requester.preferenceRevision,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      expiresAt: { $gt: now },
    }).lean<{ candidateIds: string[] } | null>();
    if (!session)
      return error(
        "MATCHING_CURSOR_STALE",
        409,
        "Matching feed changed; refresh it",
      );
    candidateIds = session.candidateIds;
  } else {
    offset = 0;
    const requesterProjection = await CandidateDiscoveryProjection.findOne({
      userId: input.currentUserId,
      active: true,
      requiredDataReady: true,
      location: { $exists: true },
    })
      .select({ userId: 1, age: 1, location: 1 })
      .lean<Pick<DiscoveryCandidate, "userId" | "age" | "location"> | null>();
    if (!requesterProjection?.location) {
      return error(
        "MATCHING_LOCATION_REQUIRED",
        409,
        "Add a valid location before using matching",
      );
    }
    const projections = await CandidateDiscoveryProjection.find({
      userId: { $ne: input.currentUserId },
      active: true,
      requiredDataReady: true,
      relationshipIntent: "SEEKING_RELATIONSHIP",
      age: {
        $gte: requester.desiredAgeRange.min,
        $lte: requester.desiredAgeRange.max,
      },
      location: {
        $near: {
          $geometry: requesterProjection.location,
          $maxDistance: requester.maxDistanceKm * 1_000,
        },
      },
    })
      .limit(200)
      .lean<DiscoveryCandidate[]>();
    const preliminaryIds = projections.map((projection) => projection.userId);
    const candidateProfiles = await MatchingProfile.find({
      userId: { $in: preliminaryIds },
      active: true,
      requiredDataReady: true,
    })
      .select({ userId: 1, desiredAgeRange: 1, maxDistanceKm: 1, soughtGender: 1 })
      .lean<
        Array<
          Pick<
            MatchingProfileType,
            "userId" | "desiredAgeRange" | "maxDistanceKm" | "soughtGender"
          >
        >
      >();
    const candidateProfileById = new Map(
      candidateProfiles.map((profile) => [profile.userId, profile]),
    );
    const projectionById = new Map(
      projections.map((projection) => [projection.userId, projection]),
    );
    const people = await loadMatchingPeople([input.currentUserId, ...preliminaryIds]);
    const pool = preliminaryIds.filter((candidateId) => {
      const candidateProfile = candidateProfileById.get(candidateId);
      const projection = projectionById.get(candidateId);
      if (!candidateProfile || !projection?.location) return false;
      if (!mutualMatchingGenderEligible(people.get(input.currentUserId), people.get(candidateId), requester, candidateProfile)) return false;
      if (
        requesterProjection.age < candidateProfile.desiredAgeRange.min ||
        requesterProjection.age > candidateProfile.desiredAgeRange.max
      ) {
        return false;
      }
      return (
        distanceKm(
          requesterProjection.location.coordinates,
          projection.location.coordinates,
        ) <= candidateProfile.maxDistanceKm
      );
    });
    const [blocks, activeLikes, activeConnections, memberships] =
      await Promise.all([
        MatchingBlock.find({
          participantKey: {
            $in: pool.map((candidateId) =>
              [input.currentUserId, candidateId].sort().join("|"),
            ),
          },
          status: "ACTIVE",
        })
          .select({ participantKey: 1 })
          .lean<Array<{ participantKey: string }>>(),
        Like.find({
          $and: [
            {
              $or: [
                { fromId: input.currentUserId, toId: { $in: pool } },
                { toId: input.currentUserId, fromId: { $in: pool } },
              ],
            },
            {
              $or: [
                { status: { $in: ACTIVE_LIKE_STATUSES } },
                { status: "DECLINED", declinedUntil: { $gt: now } },
              ],
            },
          ],
        })
          .select({ fromId: 1, toId: 1 })
          .lean<Array<Pick<LikeType, "fromId" | "toId">>>(),
        MatchingConnection.find({
          participantIds: input.currentUserId,
          status: { $in: ["ACTIVE", "PAUSED"] },
        })
          .select({ participantIds: 1 })
          .lean<Array<{ participantIds: [string, string] }>>(),
        PairMembershipClaim.find({ userId: { $in: pool } })
          .select({ userId: 1 })
          .lean<Array<{ userId: string }>>(),
      ]);
    const excludedKeys = new Set(blocks.map((block) => block.participantKey));
    const excludedIds = new Set([
      ...activeLikes.map((like) =>
        like.fromId === input.currentUserId ? like.toId : like.fromId,
      ),
      ...activeConnections.flatMap((connection) =>
        connection.participantIds.filter((id) => id !== input.currentUserId),
      ),
      ...memberships.map((claim) => claim.userId),
    ]);
    const eligiblePool = pool.filter(
      (candidateId) =>
        !excludedIds.has(candidateId) &&
        !excludedKeys.has([input.currentUserId, candidateId].sort().join("|")),
    );
    const evaluations = eligiblePool.length
      ? await withMatchingIntelligenceSnapshot((service) =>
          service.rankCandidates(input.currentUserId, eligiblePool, now),
        )
      : [];
    const eligibleEvaluations = evaluations.filter(
      (evaluation) => evaluation.eligibility.eligible,
    );
    initialEvaluationsByCandidate = new Map(
      eligibleEvaluations.map((evaluation) => [
        evaluation.candidateId,
        evaluation,
      ]),
    );
    candidateIds = eligibleEvaluations.map(
      (evaluation) => evaluation.candidateId,
    );
    await persistEvaluations(evaluations, now);
    rawToken = randomBytes(32).toString("base64url");
    const queryHash = sha256(
      JSON.stringify({
        requester: input.currentUserId,
        profileRevision: requester.actualProfileRevision,
        preferenceRevision: requester.preferenceRevision,
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      }),
    );
    await MatchingFeedSession.create({
      tokenHash: sha256(rawToken),
      requesterId: input.currentUserId,
      queryHash,
      requesterProfileRevision: requester.actualProfileRevision,
      requesterPreferenceRevision: requester.preferenceRevision,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      candidateIds,
      expiresAt: new Date(now.getTime() + FEED_SESSION_TTL_MS),
    });
  }

  const pageIds = candidateIds.slice(offset, offset + input.limit);
  const pageParticipantKeys = pageIds.map((candidateId) =>
    [input.currentUserId, candidateId].sort().join("|"),
  );
  const [pageBlocks, pageMemberships, pageConnections, pageInteractions] =
    await Promise.all([
      MatchingBlock.find({
        participantKey: { $in: pageParticipantKeys },
        status: "ACTIVE",
      })
        .select({ participantKey: 1 })
        .lean<Array<{ participantKey: string }>>(),
      PairMembershipClaim.find({ userId: { $in: pageIds } })
        .select({ userId: 1 })
        .lean<Array<{ userId: string }>>(),
      MatchingConnection.find({
        participantKey: { $in: pageParticipantKeys },
        status: { $in: ["ACTIVE", "PAUSED"] },
      })
        .select({ participantKey: 1 })
        .lean<Array<{ participantKey: string }>>(),
      Like.find({
        $and: [
          {
            $or: [
              { fromId: input.currentUserId, toId: { $in: pageIds } },
              { fromId: { $in: pageIds }, toId: input.currentUserId },
            ],
          },
          {
            $or: [
              { status: { $in: ACTIVE_LIKE_STATUSES } },
              { status: "DECLINED", declinedUntil: { $gt: now } },
            ],
          },
        ],
      })
        .select({ fromId: 1, toId: 1 })
        .lean<Array<Pick<LikeType, "fromId" | "toId">>>(),
    ]);
  const excludedPageKeys = new Set([
    ...pageBlocks.map((row) => row.participantKey),
    ...pageConnections.map((row) => row.participantKey),
  ]);
  const excludedPageIds = new Set([
    ...pageMemberships.map((row) => row.userId),
    ...pageInteractions.map((row) =>
      row.fromId === input.currentUserId ? row.toId : row.fromId,
    ),
  ]);
  const eligiblePageIds = pageIds.filter(
    (candidateId) =>
      !excludedPageIds.has(candidateId) &&
      !excludedPageKeys.has(
        [input.currentUserId, candidateId].sort().join("|"),
      ),
  );
  const profiles = await MatchingProfile.find({
    userId: { $in: eligiblePageIds },
    active: true,
    requiredDataReady: true,
  }).lean<MatchingProfileType[]>();
  const pageProjections = await CandidateDiscoveryProjection.find({
    userId: { $in: [input.currentUserId, ...eligiblePageIds] },
    active: true,
    requiredDataReady: true,
    location: { $exists: true },
  }).lean<DiscoveryCandidate[]>();
  const pageProjectionById = new Map(
    pageProjections.map((projection) => [projection.userId, projection]),
  );
  const requesterProjection = pageProjectionById.get(input.currentUserId);
  if (!requesterProjection?.location) {
    return error(
      "MATCHING_LOCATION_REQUIRED",
      409,
      "Add a valid location before using matching",
    );
  }
  const profileById = new Map(
    profiles.map((profile) => [profile.userId, profile]),
  );
  const pagePeople = await loadMatchingPeople([input.currentUserId, ...eligiblePageIds]);
  const mutuallyEligiblePageIds = eligiblePageIds.filter((candidateId) => {
    const candidate = profileById.get(candidateId);
    const projection = pageProjectionById.get(candidateId);
    if (!candidate || !projection?.location) return false;
    if (!mutualMatchingGenderEligible(pagePeople.get(input.currentUserId), pagePeople.get(candidateId), requester, candidate)) return false;
    if (
      projection.age < requester.desiredAgeRange.min ||
      projection.age > requester.desiredAgeRange.max ||
      requesterProjection.age < candidate.desiredAgeRange.min ||
      requesterProjection.age > candidate.desiredAgeRange.max
    ) {
      return false;
    }
    return (
      distanceKm(
        requesterProjection.location.coordinates,
        projection.location.coordinates,
      ) <= Math.min(requester.maxDistanceKm, candidate.maxDistanceKm)
    );
  });
  const users = await findUsers(mutuallyEligiblePageIds);
  const pageEvaluations = initialEvaluationsByCandidate
    ? mutuallyEligiblePageIds
        .map((candidateId) => initialEvaluationsByCandidate?.get(candidateId))
        .filter(
          (evaluation): evaluation is MatchingEvaluation =>
            evaluation !== undefined,
        )
    : mutuallyEligiblePageIds.length
      ? await withMatchingIntelligenceSnapshot((service) =>
          service.rankCandidates(
            input.currentUserId,
            mutuallyEligiblePageIds,
            now,
          ),
        )
      : [];
  const evaluationByCandidateId = new Map(
    pageEvaluations.map((evaluation) => [evaluation.candidateId, evaluation]),
  );
  const itemCandidates: Array<{
    candidateId: string;
    candidate: MatchingProfileType;
    evaluation: MatchingEvaluation;
  }> = [];
  for (const candidateId of mutuallyEligiblePageIds) {
    const candidate = profileById.get(candidateId);
    if (!candidate) continue;
    const evaluation = evaluationByCandidateId.get(candidateId);
    if (!evaluation) continue;
    if (!evaluation.eligibility.eligible) continue;
    itemCandidates.push({ candidateId, candidate, evaluation });
  }
  await persistEvaluations(pageEvaluations, now);
  const issuedCandidates = await grantCandidates(
    itemCandidates.map(({ candidate, evaluation }) => ({
      requester,
      candidate,
      evaluation,
      now,
    })),
  );
  const items = itemCandidates.flatMap(({ candidateId, evaluation }) => {
    const candidate = issuedCandidates.candidates.get(candidateId);
    const candidateGrant = issuedCandidates.grants.get(candidateId);
    if (!candidate || !candidateGrant) return [];
    return [
      {
        candidate: nonEnumerableUser(users, candidateId),
        card: publicCard(candidate.card),
        fit: qualitativeFit(evaluation),
        candidateGrant,
      },
    ];
  });
  const nextOffset = offset + pageIds.length;
  return {
    items,
    ...(nextOffset < candidateIds.length
      ? { nextCursor: encodeFeedCursor(rawToken, nextOffset) }
      : {}),
    feedRevision: `${MVP_FACTOR_REGISTRY.registryVersion}:${requester.actualProfileRevision}:${requester.preferenceRevision}`,
  };
}

export async function getCandidateMatchingCard(input: {
  currentUserId: string;
  candidateId: string;
  candidateGrant: string;
}) {
  await connectToDatabase();
  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const participantIds = [input.currentUserId, input.candidateId];
      const fenced = await User.updateMany(
        { id: { $in: participantIds } },
        { $inc: { pairMembershipRevision: 1 } },
        { session },
      );
      if (fenced.matchedCount !== participantIds.length) {
        return error("NOT_FOUND", 404, "Matching resource was not found");
      }
      const grant = await candidateGrantLookup({
        currentUserId: input.currentUserId,
        candidateId: input.candidateId,
        token: input.candidateGrant,
        session,
      });
      const profile = await MatchingProfile.findOne({
        userId: input.candidateId,
        active: true,
        requiredDataReady: true,
      })
        .session(session)
        .lean<MatchingProfileType | null>();
      const user = await User.findOne({ id: input.candidateId })
        .select({ id: 1, username: 1, avatar: 1, "personal.age": 1, "personal.city": 1 })
        .session(session)
        .lean<Pick<UserType, "id" | "username" | "avatar"> | null>();
      const evaluation = await matchingIntelligenceForSession(session).evaluate(
        input.currentUserId,
        input.candidateId,
        new Date(),
      );
      if (!profile || !user || evaluation.evaluationId !== grant.evaluationId) {
        return error("NOT_FOUND", 404, "Matching resource was not found");
      }
      return {
        candidate: userDTO(user),
        card: publicCard(profile.card),
        fit: qualitativeFit(evaluation),
      };
    });
    return (
      result ??
      error(
        "MATCHING_CARD_UNAVAILABLE",
        503,
        "Candidate card transaction did not complete",
      )
    );
  } finally {
    await session.endSession();
  }
}

export async function createMatchingLike(input: {
  currentUserId: string;
  candidateId: string;
  candidateGrant: string;
  agreements: [true, true, true];
  answers: MatchingAnswers;
  reactions?: MatchingStatementReaction[];
  idempotencyKey: string;
  auditRequest: AuditRequestContext;
}) {
  await connectToDatabase();
  await candidateGrantLookup({
    currentUserId: input.currentUserId,
    candidateId: input.candidateId,
    token: input.candidateGrant,
  });
  const profiles = await MatchingProfile.find({
    userId: { $in: [input.currentUserId, input.candidateId] },
  }).lean<MatchingProfileType[]>();
  const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
  const sender = byId.get(input.currentUserId);
  const target = byId.get(input.candidateId);
  if (!sender || !target)
    return error("NOT_FOUND", 404, "Matching resource was not found");
  const result = await socialService.createLike({
    senderId: input.currentUserId,
    recipientId: input.candidateId,
    candidateGrantToken: input.candidateGrant,
    idempotencyKey: input.idempotencyKey,
    senderCardSnapshot: {
      requirements: sender.card.requirements,
      give: sender.card.give,
      questions: sender.card.questions,
      boundaries: sender.card.boundaries,
      boundaryDealbreakers: sender.card.boundaryDealbreakers,
      cardVersion: sender.card.cardVersion,
      updatedAt: sender.updatedAt,
    },
    senderCardRevision: sender.publicCardRevision,
    targetCardSnapshot: {
      requirements: target.card.requirements,
      give: target.card.give,
      questions: target.card.questions,
      boundaries: target.card.boundaries,
      boundaryDealbreakers: target.card.boundaryDealbreakers,
      cardVersion: target.card.cardVersion,
      updatedAt: target.updatedAt,
    },
    targetCardRevision: target.publicCardRevision,
    agreements: input.agreements,
    answers: input.answers,
    reactions: input.reactions,
    auditRequest: input.auditRequest,
  });
  return getMatchingLike({
    currentUserId: input.currentUserId,
    likeId: result.likeId,
  });
}

const getLikeForActor = async (
  currentUserId: string,
  likeId: string,
): Promise<StoredLike> => {
  if (!Types.ObjectId.isValid(likeId)) {
    return error("NOT_FOUND", 404, "Matching resource was not found");
  }
  const like = await Like.findOne({
    _id: new Types.ObjectId(likeId),
    $or: [{ fromId: currentUserId }, { toId: currentUserId }],
  })
    .select("+agreements +answers +reactions")
    .lean<StoredLike | null>();
  if (!like) return error("NOT_FOUND", 404, "Matching resource was not found");
  return like;
};

const assertConnectionCurrentAccess = async (connection: StoredConnection, currentUserId: string): Promise<void> => {
  if (connection.status === "BLOCKED" || await MatchingBlock.exists({ participantKey: connection.participantKey, status: "ACTIVE" })) return error("MATCHING_BLOCKED", 409, "Matching interaction is unavailable");
  if (connection.pairId && !await Pair.exists({ _id: connection.pairId, members: currentUserId, status: { $in: ["active", "paused"] } })) return error("MATCHING_CONNECTION_STATE_CONFLICT", 409, "Pair is no longer active");
};

export async function authorizeCreateMatchingLikeMutation(input: { currentUserId: string; candidateId: string }): Promise<void> {
  await connectToDatabase();
  const ids = [...new Set([input.currentUserId, input.candidateId])];
  if (await User.countDocuments({ id: { $in: ids } }) !== ids.length) return error("NOT_FOUND", 404, "Matching resource was not found");
  if (await MatchingBlock.exists({ participantKey: [...ids].sort().join("|"), status: "ACTIVE" })) return error("MATCHING_BLOCKED", 409, "Matching interaction is unavailable");
}

export async function authorizeMatchingLikeMutation(input: { currentUserId: string; likeId: string }): Promise<void> {
  await connectToDatabase();
  const like = await getLikeForActor(input.currentUserId, input.likeId);
  if (like.status === "BLOCKED" || await MatchingBlock.exists({ participantKey: [like.fromId, like.toId].sort().join("|"), status: "ACTIVE" })) return error("MATCHING_BLOCKED", 409, "Matching interaction is unavailable");
  if (like.connectionId) {
    const connection = await MatchingConnection.findOne({ _id: like.connectionId, participantIds: input.currentUserId }).lean<StoredConnection | null>();
    if (!connection || (connection.status !== "ACTIVE" && connection.status !== "PAUSED")) return error("MATCHING_CONNECTION_STATE_CONFLICT", 409, "Connection is not active");
    await assertConnectionCurrentAccess(connection, input.currentUserId);
  }
  if (like.status === "EXPIRED") return error("MATCHING_STATE_CONFLICT", 409, "Matching request expired");
}

export async function authorizeMatchingConnectionMutation(input: { currentUserId: string; connectionId: string; action: ConnectionAction }): Promise<void> {
  await connectToDatabase();
  if (!Types.ObjectId.isValid(input.connectionId)) return error("NOT_FOUND", 404, "Matching resource was not found");
  const connection = await MatchingConnection.findOne({ _id: new Types.ObjectId(input.connectionId), participantIds: input.currentUserId }).lean<StoredConnection | null>();
  if (!connection) return error("NOT_FOUND", 404, "Matching resource was not found");
  await assertConnectionCurrentAccess(connection, input.currentUserId);
  matchingConnectionTransition({ participantIds: matchingParticipantIds(...connection.participantIds), status: connection.status, stage: connection.stage, coupleConfirmation: connection.coupleConfirmation, revision: connection.revision, ...(connection.pairId ? { pairId: String(connection.pairId) } : {}) }, { type: input.action, at: new Date() }, input.currentUserId);
}

const expireMatchingRequests = async (actorId: string) => {
  await Like.updateMany({ $or: [{ fromId: actorId }, { toId: actorId }], status: { $in: ["SENT", "VIEWED"] }, createdAt: { $lte: new Date(Date.now() - MATCHING_REQUEST_TTL_MS) } }, { $set: { status: "EXPIRED" }, $inc: { revision: 1 } });
};

export async function withdrawMatchingLike(input: { currentUserId: string; likeId: string; auditRequest: AuditRequestContext }) {
  await socialService.withdrawLike({ actorId: input.currentUserId, likeId: input.likeId, auditRequest: input.auditRequest });
  return getMatchingLike(input);
}

export async function getMatchingLike(input: {
  currentUserId: string;
  likeId: string;
}) {
  await connectToDatabase();
  await expireMatchingRequests(input.currentUserId);
  let like = await getLikeForActor(input.currentUserId, input.likeId);
  if (like.toId === input.currentUserId && like.status === "SENT") {
    await socialService.markLikeViewed({
      actorId: input.currentUserId,
      likeId: input.likeId,
    });
    like = await getLikeForActor(input.currentUserId, input.likeId);
  }
  return likeDetail(like, input.currentUserId);
}

export async function respondMatchingLike(input: {
  currentUserId: string;
  likeId: string;
  agreements: [true, true, true];
  answers: MatchingAnswers;
  reactions?: MatchingStatementReaction[];
  auditRequest: AuditRequestContext;
}) {
  await socialService.respondToLike({
    actorId: input.currentUserId,
    likeId: input.likeId,
    agreements: input.agreements,
    answers: input.answers,
    reactions: input.reactions,
    auditRequest: input.auditRequest,
  });
  return getMatchingLike({
    currentUserId: input.currentUserId,
    likeId: input.likeId,
  });
}

export async function acceptMatchingLike(input: {
  currentUserId: string;
  likeId: string;
  auditRequest: AuditRequestContext;
}) {
  await socialService.acceptLike({
    actorId: input.currentUserId,
    likeId: input.likeId,
    auditRequest: input.auditRequest,
  });
  return getMatchingLike({
    currentUserId: input.currentUserId,
    likeId: input.likeId,
  });
}

export async function rejectMatchingLike(input: {
  currentUserId: string;
  likeId: string;
  auditRequest: AuditRequestContext;
}) {
  await socialService.declineLike({
    actorId: input.currentUserId,
    likeId: input.likeId,
    auditRequest: input.auditRequest,
  });
  return getMatchingLike({
    currentUserId: input.currentUserId,
    likeId: input.likeId,
  });
}

export async function blockMatchingUser(input: {
  currentUserId: string;
  blockedUserId: string;
  auditRequest: AuditRequestContext;
}) {
  if (input.currentUserId === input.blockedUserId) {
    return error("VALIDATION_ERROR", 400, "A user cannot block themselves");
  }
  await socialService.blockParticipant({
    actorId: input.currentUserId,
    targetId: input.blockedUserId,
    auditRequest: input.auditRequest,
  });
  return { blockedUserId: input.blockedUserId, blocked: true as const };
}

export async function unblockMatchingUser(input: {
  currentUserId: string;
  blockedUserId: string;
  auditRequest: AuditRequestContext;
}) {
  await socialService.unblockParticipant({
    actorId: input.currentUserId,
    targetId: input.blockedUserId,
    auditRequest: input.auditRequest,
  });
  return { blockedUserId: input.blockedUserId, blocked: false as const };
}

const decodeInboxCursor = (
  cursor?: string,
): { updatedAt: Date; id: Types.ObjectId } | null => {
  if (!cursor) return null;
  try {
    const value = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = value.indexOf("|");
    const updatedAt = new Date(value.slice(0, separator));
    const id = value.slice(separator + 1);
    if (Number.isNaN(updatedAt.getTime()) || !Types.ObjectId.isValid(id)) {
      return error(
        "MATCHING_CURSOR_INVALID",
        400,
        "Matching cursor is invalid",
      );
    }
    return { updatedAt, id: new Types.ObjectId(id) };
  } catch {
    return error("MATCHING_CURSOR_INVALID", 400, "Matching cursor is invalid");
  }
};

const encodeInboxCursor = (like: StoredLike): string =>
  Buffer.from(
    `${(like.updatedAt ?? like.createdAt ?? new Date(0)).toISOString()}|${like._id}`,
    "utf8",
  ).toString("base64url");

export async function getMatchingInbox(input: {
  currentUserId: string;
  cursor?: string;
  limit: number;
}) {
  await connectToDatabase();
  await expireMatchingRequests(input.currentUserId);
  const cursor = decodeInboxCursor(input.cursor);
  const cursorFilter = cursor
    ? {
        $or: [
          { updatedAt: { $lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
        ],
      }
    : {};
  const likes = await Like.find({
    $and: [
      { $or: [{ fromId: input.currentUserId }, { toId: input.currentUserId }] },
      cursorFilter,
    ],
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(input.limit + 1)
    .lean<StoredLike[]>();
  const hasMore = likes.length > input.limit;
  const page = hasMore ? likes.slice(0, input.limit) : likes;
  const users = await findUsers(
    page
      .flatMap((like) => [like.fromId, like.toId])
      .filter((id) => id !== input.currentUserId),
  );
  const connections = await MatchingConnection.find({
    participantIds: input.currentUserId,
    status: { $in: ["ACTIVE", "BLOCKED"] },
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(input.limit)
    .lean<StoredConnection[]>();
  return {
    incoming: page
      .filter((like) => like.toId === input.currentUserId)
      .map((like) => toLikeSummary(like, input.currentUserId, users)),
    outgoing: page
      .filter((like) => like.fromId === input.currentUserId)
      .map((like) => toLikeSummary(like, input.currentUserId, users)),
    connections: await Promise.all(
      connections.map((connection) =>
        connectionDTO(connection, input.currentUserId),
      ),
    ),
    ...(hasMore && page.at(-1)
      ? { nextCursor: encodeInboxCursor(page.at(-1)!) }
      : {}),
  };
}

export async function getMatchingConnection(input: {
  currentUserId: string;
  connectionId: string;
}) {
  const result = await socialService.getConnection({
    actorId: input.currentUserId,
    connectionId: input.connectionId,
  });
  return connectionDTO(result, input.currentUserId);
}

export async function confirmMatchingConnection(input: {
  currentUserId: string;
  connectionId: string;
  action: "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE";
  auditRequest: AuditRequestContext;
}) {
  const result = await socialService.confirmConnection({
    actorId: input.currentUserId,
    connectionId: input.connectionId,
    action: input.action,
    auditRequest: input.auditRequest,
  });
  return connectionDTO(result, input.currentUserId);
}
