import { assertMatchingSolo } from "../matchingEligibility.service";
import { assertMatchingConnectionCapacity, matchingRequestExpired, MATCHING_OCCUPIED_STATUSES, validateMatchingResponse, type MatchingAnswers, type MatchingStatementReaction } from "@/domain/model/matching/socialContract";
import { createHash } from "node:crypto";
import mongoose, { Types, type ClientSession } from "mongoose";
import { DomainError } from "@/domain/errors";
import {
  SOCIAL_LIKE_STATUSES,
  matchingConnectionTransition,
  matchingParticipantIds,
  matchingParticipantKey,
  socialLikeTransition,
  type MatchingConnectionSnapshot,
  type MatchingParticipantIds,
  type SocialLikeActorRole,
  type SocialLikeStatus,
} from "@/domain/state/matching";
import { connectToDatabase } from "@/lib/mongodb";
import { Like, type CardSnapshot, type LikeType } from "@/models/Like";
import {
  MatchingConnection,
  type MatchingConnectionType,
} from "@/models/MatchingConnection";
import { MatchingBlock } from "@/models/MatchingBlock";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import type {
  CandidateGrantValidationPort,
  MatchingAuditRequest,
  MatchingCardSnapshot,
  MatchingParticipantFencePort,
  MatchingSocialEffectsPort,
  PairFormationPort,
} from "./ports";
import { noMatchingSocialEffects } from "./ports";

export const MATCHING_DECLINE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;

const ACTIVE_LIKE_STATUSES: readonly SocialLikeStatus[] = [
  "SENT",
  "VIEWED",
  "RESPONDED",
  "MATCHED",
];
const CANONICAL_STATUS_SET = new Set<string>(SOCIAL_LIKE_STATUSES);
const MAX_TRANSACTION_ATTEMPTS = 3;

type StoredLike = LikeType & {
  _id: Types.ObjectId;
  revision?: number;
  interactionKey?: string;
};

type StoredConnection = MatchingConnectionType & {
  _id: Types.ObjectId;
};

type MongoRaceError = Error & {
  code?: number;
  errorLabels?: string[];
};

export type MatchingSocialServiceDependencies = {
  candidateGrants: CandidateGrantValidationPort;
  participantFence: MatchingParticipantFencePort;
  pairFormation: PairFormationPort;
  effects?: MatchingSocialEffectsPort;
};

export type CreateSocialLikeInput = {
  senderId: string;
  recipientId: string;
  candidateGrantToken: string;
  idempotencyKey: string;
  senderCardSnapshot: MatchingCardSnapshot;
  senderCardRevision: number;
  targetCardSnapshot: MatchingCardSnapshot;
  targetCardRevision: number;
  agreements: readonly [true, true, true];
  answers: Readonly<MatchingAnswers>;
  reactions?: MatchingStatementReaction[];
  auditRequest?: MatchingAuditRequest;
  now?: Date;
};

export type CreateSocialLikeResult = {
  likeId: string;
  status: "SENT";
  revision: number;
  replayed: boolean;
};

export type SocialLikeMutationResult = {
  likeId: string;
  status: SocialLikeStatus;
  revision: number;
  noop: boolean;
};

export type RespondToSocialLikeInput = {
  actorId: string;
  likeId: string;
  agreements: readonly [true, true, true];
  answers: Readonly<MatchingAnswers>;
  reactions?: MatchingStatementReaction[];
  auditRequest?: MatchingAuditRequest;
  now?: Date;
};

export type DecideSocialLikeInput = {
  actorId: string;
  likeId: string;
  auditRequest?: MatchingAuditRequest;
  now?: Date;
};

export type BlockMatchingParticipantInput = {
  actorId: string;
  targetId: string;
  auditRequest?: MatchingAuditRequest;
  now?: Date;
};

export type MatchingBlockMutationResult = {
  participantKey: string;
  status: "ACTIVE" | "REVOKED";
  noop: boolean;
};

export type AcceptSocialLikeResult = SocialLikeMutationResult & {
  connectionId: string;
  participantKey: string;
};

export type ConfirmMatchingConnectionInput = {
  actorId: string;
  connectionId: string;
  action: "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE";
  auditRequest?: MatchingAuditRequest;
  now?: Date;
};

export type MatchingConnectionResult = {
  connectionId: string;
  participantIds: MatchingParticipantIds;
  participantKey: string;
  status: MatchingConnectionSnapshot["status"];
  stage: MatchingConnectionSnapshot["stage"];
  confirmation: {
    requestedBy?: string;
    requestedAt?: string;
    confirmedBy: readonly string[];
    revision: number;
  };
  pairId?: string;
  revision: number;
  noop: boolean;
};

export interface MatchingSocialService {
  createLike(input: CreateSocialLikeInput): Promise<CreateSocialLikeResult>;
  markLikeViewed(
    input: DecideSocialLikeInput,
  ): Promise<SocialLikeMutationResult>;
  respondToLike(
    input: RespondToSocialLikeInput,
  ): Promise<SocialLikeMutationResult>;
  acceptLike(input: DecideSocialLikeInput): Promise<AcceptSocialLikeResult>;
  withdrawLike(input: DecideSocialLikeInput): Promise<SocialLikeMutationResult>;
  declineLike(input: DecideSocialLikeInput): Promise<SocialLikeMutationResult>;
  blockParticipant(
    input: BlockMatchingParticipantInput,
  ): Promise<MatchingBlockMutationResult>;
  unblockParticipant(
    input: BlockMatchingParticipantInput,
  ): Promise<MatchingBlockMutationResult>;
  getConnection(input: {
    actorId: string;
    connectionId: string;
  }): Promise<MatchingConnectionResult>;
  confirmConnection(
    input: ConfirmMatchingConnectionInput,
  ): Promise<MatchingConnectionResult>;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const invalidInput = (message: string): never => {
  throw new DomainError({
    code: "VALIDATION_ERROR",
    status: 400,
    message,
  });
};

const stateConflict = (message: string): never => {
  throw new DomainError({
    code: "MATCHING_STATE_CONFLICT",
    status: 409,
    message,
  });
};

const resourceNotFound = (): never => {
  throw new DomainError({
    code: "NOT_FOUND",
    status: 404,
    message: "Matching resource was not found",
  });
};

const blocked = (): never => {
  throw new DomainError({
    code: "MATCHING_BLOCKED",
    status: 409,
    message: "Matching interaction is unavailable",
  });
};

const isMongoRaceError = (error: Error): boolean => {
  const candidate = error as MongoRaceError;
  return (
    candidate.code === 11000 ||
    candidate.code === 112 ||
    candidate.errorLabels?.includes("TransientTransactionError") === true ||
    candidate.errorLabels?.includes("UnknownTransactionCommitResult") === true
  );
};

const runTransaction = async <Result>(
  operation: (session: ClientSession) => Promise<Result>,
): Promise<Result> => {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      const result = await session.withTransaction(() => operation(session));
      if (result === undefined) {
        throw new Error("Matching transaction returned no result");
      }
      return result;
    } catch (caughtError) {
      const error =
        caughtError instanceof Error
          ? caughtError
          : new Error("Matching transaction failed");
      lastError = error;
      if (
        !isMongoRaceError(error) ||
        attempt + 1 === MAX_TRANSACTION_ATTEMPTS
      ) {
        throw error;
      }
    } finally {
      await session.endSession();
    }
  }
  throw lastError ?? new Error("Matching transaction failed");
};

const normalizeText = (value: string, maximum: number): string => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    return invalidInput("Matching text is invalid");
  }
  return normalized;
};

const cloneCardSnapshot = (
  snapshot: MatchingCardSnapshot,
): CardSnapshot & { give: [string, string, string] } => {
  if (
    snapshot.requirements.length !== 3 ||
    snapshot.give.length !== 3 ||
    (snapshot.questions.length !== 2 && snapshot.questions.length !== 3)
  ) {
    return invalidInput("Matching card snapshot is invalid");
  }
  const updatedAt = snapshot.updatedAt
    ? new Date(snapshot.updatedAt)
    : undefined;
  if (updatedAt && Number.isNaN(updatedAt.getTime())) {
    return invalidInput("Matching card snapshot date is invalid");
  }
  return {
    requirements: [
      normalizeText(snapshot.requirements[0], 80),
      normalizeText(snapshot.requirements[1], 80),
      normalizeText(snapshot.requirements[2], 80),
    ],
    give: [
      normalizeText(snapshot.give[0], 80),
      normalizeText(snapshot.give[1], 80),
      normalizeText(snapshot.give[2], 80),
    ],
    questions: [
      normalizeText(snapshot.questions[0], 120),
      normalizeText(snapshot.questions[1], 120),
      ...(snapshot.questions.length === 3 ? [normalizeText(snapshot.questions[2], 120)] : []),
    ] as MatchingAnswers,
    ...(snapshot.boundaries ? { boundaries: [...snapshot.boundaries] as [string, string, string] } : {}),
    ...(snapshot.boundaryDealbreakers ? { boundaryDealbreakers: [...snapshot.boundaryDealbreakers] as [boolean, boolean, boolean] } : {}),
    cardVersion: snapshot.cardVersion ?? 1,
    ...(updatedAt ? { updatedAt } : {}),
  };
};

const normalizeAnswers = (answers: Readonly<MatchingAnswers>): MatchingAnswers => {
  if (answers.length !== 2 && answers.length !== 3) return invalidInput("Matching answers are invalid");
  return answers.map((answer) => normalizeText(answer, 280)) as MatchingAnswers;
};

const normalizeAgreements = (
  agreements: readonly [true, true, true],
): [true, true, true] => {
  if (
    agreements.length !== 3 ||
    agreements[0] !== true ||
    agreements[1] !== true ||
    agreements[2] !== true
  ) {
    return invalidInput("Matching agreements are required");
  }
  return [true, true, true];
};

const assertRevision = (revision: number): number => {
  if (!Number.isInteger(revision) || revision < 1) {
    return invalidInput("Matching card revision is invalid");
  }
  return revision;
};

const canonicalStatus = (status: LikeType["status"]): SocialLikeStatus => {
  if (!CANONICAL_STATUS_SET.has(status)) {
    throw new DomainError({
      code: "MATCHING_LEGACY_STATE_REQUIRES_MIGRATION",
      status: 409,
      message: "Matching interaction requires migration",
    });
  }
  return status as SocialLikeStatus;
};

const likeRole = (like: StoredLike, actorId: string): SocialLikeActorRole => {
  if (like.fromId === actorId) return "SENDER";
  if (like.toId === actorId) return "RECIPIENT";
  return resourceNotFound();
};

const likeRevision = (like: StoredLike): number => like.revision ?? 0;

const declinedByRole = (
  like: StoredLike,
): Exclude<SocialLikeActorRole, "SYSTEM"> | undefined => {
  if (like.initiatorDecision?.accepted === false) return "SENDER";
  if (like.recipientDecision?.accepted === false) return "RECIPIENT";
  return undefined;
};

const findLikeForActor = async (
  likeId: string,
  actorId: string,
  session: ClientSession,
): Promise<StoredLike> => {
  if (!Types.ObjectId.isValid(likeId)) return resourceNotFound();
  const like = await Like.findOne({
    _id: new Types.ObjectId(likeId),
    $or: [{ fromId: actorId }, { toId: actorId }],
  })
    .select("+agreements +answers +creationRequestHash")
    .session(session)
    .lean<StoredLike | null>();
  if (!like) return resourceNotFound();
  return like;
};

const activeBlockExists = async (
  participantKey: string,
  session: ClientSession,
): Promise<boolean> =>
  Boolean(
    await MatchingBlock.exists({
      participantKey,
      status: "ACTIVE",
    }).session(session),
  );

const requestHashForLike = (input: {
  senderId: string;
  recipientId: string;
  candidateGrantToken: string;
  senderCardSnapshot: CardSnapshot;
  senderCardRevision: number;
  targetCardSnapshot: CardSnapshot;
  targetCardRevision: number;
  agreements: readonly [true, true, true];
  answers: Readonly<MatchingAnswers>;
  reactions?: MatchingStatementReaction[];
}): string =>
  sha256(
    JSON.stringify({
      version: "matching-social-like-v1",
      senderId: input.senderId,
      recipientId: input.recipientId,
      candidateGrantHash: sha256(input.candidateGrantToken),
      senderCardSnapshot: input.senderCardSnapshot,
      senderCardRevision: input.senderCardRevision,
      targetCardSnapshot: input.targetCardSnapshot,
      targetCardRevision: input.targetCardRevision,
      agreements: input.agreements,
      answers: input.answers,
      reactions: input.reactions ?? [],
    }),
  );

const connectionSnapshot = (
  connection: StoredConnection,
): MatchingConnectionSnapshot => ({
  participantIds: matchingParticipantIds(
    connection.participantIds[0],
    connection.participantIds[1],
  ),
  stage: connection.stage,
  status: connection.status,
  coupleConfirmation: {
    ...(connection.coupleConfirmation.requestedBy
      ? { requestedBy: connection.coupleConfirmation.requestedBy }
      : {}),
    ...(connection.coupleConfirmation.requestedAt
      ? { requestedAt: connection.coupleConfirmation.requestedAt }
      : {}),
    confirmedBy: [...connection.coupleConfirmation.confirmedBy],
    revision: connection.coupleConfirmation.revision,
  },
  ...(connection.pairId ? { pairId: String(connection.pairId) } : {}),
  revision: connection.revision,
});

const connectionResult = (
  connection: StoredConnection,
  noop: boolean,
): MatchingConnectionResult => ({
  connectionId: String(connection._id),
  participantIds: matchingParticipantIds(
    connection.participantIds[0],
    connection.participantIds[1],
  ),
  participantKey: connection.participantKey,
  status: connection.status,
  stage: connection.stage,
  confirmation: {
    ...(connection.coupleConfirmation.requestedBy
      ? { requestedBy: connection.coupleConfirmation.requestedBy }
      : {}),
    ...(connection.coupleConfirmation.requestedAt
      ? { requestedAt: connection.coupleConfirmation.requestedAt.toISOString() }
      : {}),
    confirmedBy: [...connection.coupleConfirmation.confirmedBy],
    revision: connection.coupleConfirmation.revision,
  },
  ...(connection.pairId ? { pairId: String(connection.pairId) } : {}),
  revision: connection.revision,
  noop,
});

const findConnectionForActor = async (
  connectionId: string,
  actorId: string,
  session?: ClientSession,
): Promise<StoredConnection> => {
  if (!Types.ObjectId.isValid(connectionId)) return resourceNotFound();
  const query = MatchingConnection.findOne({
    _id: new Types.ObjectId(connectionId),
    participantIds: actorId,
  }).lean<StoredConnection | null>();
  if (session) query.session(session);
  const connection = await query;
  if (!connection) return resourceNotFound();
  return connection;
};

const activePairMembershipExists = async (
  participantIds: MatchingParticipantIds,
  session: ClientSession,
): Promise<boolean> =>
  Boolean(
    await PairMembershipClaim.exists({
      userId: { $in: [...participantIds] },
    }).session(session),
  );

const sameAnswers = (
  left: readonly string[] | undefined,
  right: Readonly<MatchingAnswers>,
): boolean => left?.length === right.length && left.every((value, index) => value === right[index]);

const sameAgreements = (
  left: readonly boolean[] | undefined,
  right: readonly [true, true, true],
): boolean =>
  left?.[0] === right[0] && left?.[1] === right[1] && left?.[2] === right[2];

export const createMatchingSocialService = (
  dependencies: MatchingSocialServiceDependencies,
): MatchingSocialService => {
  const effects = dependencies.effects ?? noMatchingSocialEffects;

  const createLike = async (
    input: CreateSocialLikeInput,
  ): Promise<CreateSocialLikeResult> => {
    await connectToDatabase();
    const participantIds = matchingParticipantIds(
      input.senderId,
      input.recipientId,
    );
    const participantKey = matchingParticipantKey(
      input.senderId,
      input.recipientId,
    );
    const interactionKey = `${input.senderId}|${input.recipientId}`;
    const idempotencyKey = input.idempotencyKey.trim();
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return invalidInput("Idempotency key is invalid");
    }
    const senderCardSnapshot = cloneCardSnapshot(input.senderCardSnapshot);
    const targetCardSnapshot = cloneCardSnapshot(input.targetCardSnapshot);
    const senderCardRevision = assertRevision(input.senderCardRevision);
    const targetCardRevision = assertRevision(input.targetCardRevision);
    const agreements = normalizeAgreements(input.agreements);
    const answers = normalizeAnswers(input.answers);
    validateMatchingResponse(targetCardSnapshot, answers, input.reactions);
    const creationKeyHash = sha256(
      JSON.stringify(["matching-like-key-v1", input.senderId, idempotencyKey]),
    );
    const creationRequestHash = requestHashForLike({
      ...input,
      senderCardSnapshot,
      targetCardSnapshot,
      senderCardRevision,
      targetCardRevision,
      agreements,
      answers,
      reactions: input.reactions ?? [],
    });
    const now = input.now ?? new Date();

    return runTransaction(async (session) => {
      const replay = await Like.findOne({
        fromId: input.senderId,
        creationKeyHash,
      })
        .select({ _id: 1, status: 1, revision: 1, creationRequestHash: 1 })
        .session(session)
        .lean<StoredLike | null>();
      if (replay) {
        if (replay.creationRequestHash !== creationRequestHash) {
          throw new DomainError({
            code: "IDEMPOTENCY_KEY_REUSE_CONFLICT",
            status: 409,
            message: "Idempotency key was used with another matching request",
          });
        }
        canonicalStatus(replay.status);
        return {
          likeId: String(replay._id),
          status: "SENT",
          revision: 1,
          replayed: true,
        };
      }

      await dependencies.participantFence.fence({ participantIds, session });
      if (await activeBlockExists(participantKey, session)) return blocked();
      const activeInteraction = await Like.exists({
        fromId: input.senderId,
        toId: input.recipientId,
        status: { $in: ACTIVE_LIKE_STATUSES },
      }).session(session);
      if (activeInteraction) {
        return stateConflict("An active matching interaction already exists");
      }
      const declineCooldown = await Like.exists({
        fromId: input.senderId,
        toId: input.recipientId,
        status: "DECLINED",
        declinedUntil: { $gt: now },
      }).session(session);
      if (declineCooldown) {
        return stateConflict("Matching decline cooldown is active");
      }

      const transition = socialLikeTransition(
        { status: "DRAFT", revision: 0 },
        { type: "CREATE" },
        "SENDER",
      );
      const likeId = new Types.ObjectId();
      const grant = await dependencies.candidateGrants.reserveForLike({
        token: input.candidateGrantToken,
        requesterId: input.senderId,
        candidateId: input.recipientId,
        senderCardSnapshot,
        senderCardRevision,
        targetCardSnapshot,
        targetCardRevision,
        likeId: String(likeId),
        now,
        session,
      });
      if (!Types.ObjectId.isValid(grant.grantId)) {
        throw new Error("Candidate grant port returned an invalid id");
      }

      const created = await Like.create(
        [
          {
            _id: likeId,
            fromId: input.senderId,
            toId: input.recipientId,
            interactionKey,
            status: transition.nextStatus,
            revision: transition.nextRevision,
            creationKeyHash,
            creationRequestHash,
            fromCardSnapshot: senderCardSnapshot,
            senderCardRevision,
            targetCardSnapshot,
            targetCardRevision,
            candidateGrantId: new Types.ObjectId(grant.grantId),
            agreements,
            answers,
      reactions: input.reactions ?? [],
          },
        ],
        { session },
      );
      const like = created[0];
      if (!like) throw new Error("Like creation returned no document");

      await effects.record({
        effectKey: `matching-like:${String(like._id)}:created`,
        name: "LIKE_CREATED",
        actorId: input.senderId,
        participantIds,
        resourceId: String(like._id),
        auditRequest: input.auditRequest,
        session,
        now,
      });
      return {
        likeId: String(like._id),
        status: "SENT",
        revision: transition.nextRevision,
        replayed: false,
      };
    });
  };

  const markLikeViewed = async (
    input: DecideSocialLikeInput,
  ): Promise<SocialLikeMutationResult> => {
    await connectToDatabase();
    const now = input.now ?? new Date();
    return runTransaction(async (session) => {
      const like = await findLikeForActor(input.likeId, input.actorId, session);
      const role = likeRole(like, input.actorId);
      if (
        await activeBlockExists(
          matchingParticipantKey(like.fromId, like.toId),
          session,
        )
      ) {
        return blocked();
      }
      const transition = socialLikeTransition(
        { status: canonicalStatus(like.status), revision: likeRevision(like) },
        { type: "VIEW" },
        role,
      );
      if (transition.outcome === "NOOP") {
        return {
          likeId: String(like._id),
          status: transition.nextStatus,
          revision: transition.nextRevision,
          noop: true,
        };
      }
      const updated = await Like.findOneAndUpdate(
        {
          _id: like._id,
          toId: input.actorId,
          status: "SENT",
          revision: likeRevision(like),
        },
        {
          $set: {
            status: transition.nextStatus,
            revision: transition.nextRevision,
            updatedAt: now,
          },
        },
        { new: true, session },
      ).lean<StoredLike | null>();
      if (!updated)
        return stateConflict("Like changed while it was being viewed");
      await effects.record({
        effectKey: `matching-like:${String(like._id)}:viewed`,
        name: "LIKE_VIEWED",
        actorId: input.actorId,
        participantIds: matchingParticipantIds(like.fromId, like.toId),
        resourceId: String(like._id),
        auditRequest: input.auditRequest,
        session,
        now,
      });
      return {
        likeId: String(updated._id),
        status: canonicalStatus(updated.status),
        revision: likeRevision(updated),
        noop: false,
      };
    });
  };

  const linkMatchedConnection = async (like: StoredLike, session: ClientSession) => {
      const participantIds = matchingParticipantIds(like.fromId, like.toId);
      const participantKey = matchingParticipantKey(like.fromId, like.toId);
      let connection = await MatchingConnection.findOne({
        participantKey,
        status: { $in: [...MATCHING_OCCUPIED_STATUSES] },
      })
        .session(session)
        .lean<StoredConnection | null>();

      if (!connection) {
        const counts: number[] = [];
        for (const id of participantIds) counts.push(await MatchingConnection.countDocuments({ participantIds: id, status: { $in: [...MATCHING_OCCUPIED_STATUSES] }, pairId: { $exists: false } }).session(session));
        assertMatchingConnectionCapacity(counts);
        const created = await MatchingConnection.create(
          [
            {
              participantIds: [...participantIds],
              participantKey,
              sourceLikeIds: [String(like._id)],
              stage: "MATCHED",
              status: "ACTIVE",
              coupleConfirmation: { confirmedBy: [], revision: 0 },
              revision: 0,
            },
          ],
          { session },
        );
        const createdConnection = created[0];
        if (!createdConnection) {
          throw new Error("Connection creation returned no document");
        }
        connection = createdConnection.toObject() as StoredConnection;

      } else {
        connection = await MatchingConnection.findOneAndUpdate(
          { _id: connection._id, status: { $in: [...MATCHING_OCCUPIED_STATUSES] } },
          { $addToSet: { sourceLikeIds: String(like._id) } },
          { new: true, session },
        ).lean<StoredConnection | null>();
        if (!connection) return stateConflict("Matching connection changed");
      }

      const linked = await Like.findOneAndUpdate(
        {
          _id: like._id,
          status: "MATCHED",
          $or: [
            { connectionId: { $exists: false } },
            { connectionId: connection._id },
          ],
        },
        { $set: { connectionId: connection._id } },
        { new: true, session },
      ).lean<StoredLike | null>();
      if (!linked) return stateConflict("Like is linked to another connection");

      return { connection, linked };
  };

  const respondToLike = async (
    input: RespondToSocialLikeInput,
  ): Promise<SocialLikeMutationResult> => {
    await connectToDatabase();
    const agreements = normalizeAgreements(input.agreements);
    const answers = normalizeAnswers(input.answers);
    const now = input.now ?? new Date();
    return runTransaction(async (session) => {
      const like = await findLikeForActor(input.likeId, input.actorId, session);
      const role = likeRole(like, input.actorId);
      if ((like.status === "SENT" || like.status === "VIEWED") && matchingRequestExpired(like.createdAt, now)) return stateConflict("Matching request expired");
      if (!like.fromCardSnapshot) return stateConflict("Like sender snapshot is unavailable");
      validateMatchingResponse(like.fromCardSnapshot, answers, input.reactions);
      const status = canonicalStatus(like.status);
      const participantIds = matchingParticipantIds(like.fromId, like.toId);
      const participantKey = matchingParticipantKey(like.fromId, like.toId);
      if (await activeBlockExists(participantKey, session)) return blocked();
      await dependencies.participantFence.fence({ participantIds, session });
      await assertMatchingSolo(participantIds, session);
      if (await activePairMembershipExists(participantIds, session)) {
        return stateConflict("Matching is unavailable while a Pair is active");
      }
      const transition = socialLikeTransition(
        { status, revision: likeRevision(like) },
        { type: "RESPOND" },
        role,
      );
      if (transition.outcome === "NOOP") {
        if (
          !sameAnswers(like.recipientResponse?.answers, answers) ||
          !sameAgreements(like.recipientResponse?.agreements, agreements) ||
          JSON.stringify(like.recipientResponse?.reactions ?? []) !== JSON.stringify(input.reactions ?? [])
        ) {
          return stateConflict("Like already has a different response");
        }
        return {
          likeId: String(like._id),
          status: transition.nextStatus,
          revision: transition.nextRevision,
          noop: true,
        };
      }
      if (!like.fromCardSnapshot) {
        return stateConflict("Like sender snapshot is unavailable");
      }
      const updated = await Like.findOneAndUpdate(
        {
          _id: like._id,
          toId: input.actorId,
          status: { $in: ["SENT", "VIEWED"] },
          revision: likeRevision(like),
        },
        {
          $set: {
            status: transition.nextStatus,
            revision: transition.nextRevision,
            recipientDecision: { accepted: true, at: now },
            recipientResponse: {
              agreements,
              answers,
              reactions: input.reactions ?? [],
              initiatorCardSnapshot: like.fromCardSnapshot,
              at: now,
            },
            updatedAt: now,
          },
        },
        { new: true, session },
      ).lean<StoredLike | null>();
      if (!updated)
        return stateConflict("Like changed while response was submitted");
      const { connection } = await linkMatchedConnection(updated, session);
      await effects.record({ effectKey: `matching-connection:${String(connection._id)}:created`, name: "CONNECTION_CREATED", actorId: input.actorId, participantIds, resourceId: String(connection._id), auditRequest: input.auditRequest, session, now });
      await effects.record({
        effectKey: `matching-like:${String(like._id)}:responded`,
        name: "LIKE_RESPONDED",
        actorId: input.actorId,
        participantIds: matchingParticipantIds(like.fromId, like.toId),
        resourceId: String(like._id),
        auditRequest: input.auditRequest,
        session,
        now,
      });
      return {
        likeId: String(updated._id),
        status: canonicalStatus(updated.status),
        revision: likeRevision(updated),
        noop: false,
      };
    });
  };

  const acceptLike = async (
    input: DecideSocialLikeInput,
  ): Promise<AcceptSocialLikeResult> => {
    await connectToDatabase();
    const now = input.now ?? new Date();
    return runTransaction(async (session) => {
      const like = await findLikeForActor(input.likeId, input.actorId, session);
      const role = likeRole(like, input.actorId);
      const participantIds = matchingParticipantIds(like.fromId, like.toId);
      const participantKey = matchingParticipantKey(like.fromId, like.toId);
      if (await activeBlockExists(participantKey, session)) return blocked();
      await dependencies.participantFence.fence({ participantIds, session });
      await assertMatchingSolo(participantIds, session);
      if (await activePairMembershipExists(participantIds, session)) {
        return stateConflict("Matching is unavailable while a Pair is active");
      }
      const transition = socialLikeTransition(
        { status: canonicalStatus(like.status), revision: likeRevision(like) },
        { type: "ACCEPT" },
        role,
      );

      if (transition.outcome === "APPLIED") {
        const accepted = await Like.findOneAndUpdate(
          {
            _id: like._id,
            fromId: input.actorId,
            status: "RESPONDED",
            revision: likeRevision(like),
          },
          {
            $set: {
              status: transition.nextStatus,
              revision: transition.nextRevision,
              initiatorDecision: { accepted: true, at: now },
              updatedAt: now,
            },
          },
          { new: true, session },
        ).lean<StoredLike | null>();
        if (!accepted)
          return stateConflict("Like changed while it was accepted");
      }

      const { connection, linked } = await linkMatchedConnection(like, session);

      await effects.record({
        effectKey: `matching-like:${String(like._id)}:accepted`,
        name: "LIKE_ACCEPTED",
        actorId: input.actorId,
        participantIds,
        resourceId: String(like._id),
        auditRequest: input.auditRequest,
        session,
        now,
      });
      if (transition.outcome === "APPLIED") {
        await effects.record({
          effectKey: `matching-connection:${participantKey}:created`,
          name: "CONNECTION_CREATED",
          actorId: input.actorId,
          participantIds,
          resourceId: String(connection._id),
          auditRequest: input.auditRequest,
          session,
          now,
        });
      }
      return {
        likeId: String(linked._id),
        status: "MATCHED",
        revision: likeRevision(linked),
        noop: transition.outcome === "NOOP",
        connectionId: String(connection._id),
        participantKey,
      };
    });
  };

  const withdrawLike = async (input: DecideSocialLikeInput): Promise<SocialLikeMutationResult> => {
    await connectToDatabase();
    return runTransaction(async (session) => {
      const like = await findLikeForActor(input.likeId, input.actorId, session);
      const transition = socialLikeTransition({ status: canonicalStatus(like.status), revision: likeRevision(like) }, { type: "WITHDRAW" }, likeRole(like, input.actorId));
      if (transition.outcome === "NOOP") return { likeId: String(like._id), status: transition.nextStatus, revision: transition.nextRevision, noop: true };
      const updated = await Like.findOneAndUpdate({ _id: like._id, fromId: input.actorId, status: { $in: ["SENT", "VIEWED"] }, revision: likeRevision(like) }, { $set: { status: "WITHDRAWN", revision: transition.nextRevision, updatedAt: input.now ?? new Date() } }, { new: true, session }).lean<StoredLike | null>();
      if (!updated) return stateConflict("Matching request changed");
      return { likeId: String(updated._id), status: "WITHDRAWN", revision: transition.nextRevision, noop: false };
    });
  };

  const declineLike = async (
    input: DecideSocialLikeInput,
  ): Promise<SocialLikeMutationResult> => {
    await connectToDatabase();
    const now = input.now ?? new Date();
    const declinedUntil = new Date(
      now.getTime() + MATCHING_DECLINE_COOLDOWN_MS,
    );
    return runTransaction(async (session) => {
      const like = await findLikeForActor(input.likeId, input.actorId, session);
      const role = likeRole(like, input.actorId);
      if (
        await activeBlockExists(
          matchingParticipantKey(like.fromId, like.toId),
          session,
        )
      ) {
        return blocked();
      }
      const transition = socialLikeTransition(
        {
          status: canonicalStatus(like.status),
          revision: likeRevision(like),
          declinedByRole: declinedByRole(like),
        },
        { type: "DECLINE" },
        role,
      );
      if (transition.outcome === "NOOP") {
        return {
          likeId: String(like._id),
          status: transition.nextStatus,
          revision: transition.nextRevision,
          noop: true,
        };
      }
      const allowedStatuses =
        role === "SENDER" ? ["RESPONDED"] : ["SENT", "VIEWED"];
      const decisionField =
        role === "SENDER"
          ? { initiatorDecision: { accepted: false, at: now } }
          : { recipientDecision: { accepted: false, at: now } };
      const updated = await Like.findOneAndUpdate(
        {
          _id: like._id,
          ...(role === "SENDER"
            ? { fromId: input.actorId }
            : { toId: input.actorId }),
          status: { $in: allowedStatuses },
          revision: likeRevision(like),
        },
        {
          $set: {
            ...decisionField,
            status: transition.nextStatus,
            revision: transition.nextRevision,
            declinedUntil,
            updatedAt: now,
          },
        },
        { new: true, session },
      ).lean<StoredLike | null>();
      if (!updated) return stateConflict("Like changed while it was declined");
      await effects.record({
        effectKey: `matching-like:${String(like._id)}:declined`,
        name: "LIKE_DECLINED",
        actorId: input.actorId,
        participantIds: matchingParticipantIds(like.fromId, like.toId),
        resourceId: String(like._id),
        auditRequest: input.auditRequest,
        session,
        now,
      });
      return {
        likeId: String(updated._id),
        status: canonicalStatus(updated.status),
        revision: likeRevision(updated),
        noop: false,
      };
    });
  };

  const blockParticipant = async (
    input: BlockMatchingParticipantInput,
  ): Promise<MatchingBlockMutationResult> => {
    await connectToDatabase();
    const participantIds = matchingParticipantIds(
      input.actorId,
      input.targetId,
    );
    const participantKey = matchingParticipantKey(
      input.actorId,
      input.targetId,
    );
    const now = input.now ?? new Date();
    return runTransaction(async (session) => {
      await dependencies.participantFence.fence({ participantIds, session });
      const previous = await MatchingBlock.findOne({
        blockerId: input.actorId,
        blockedId: input.targetId,
      })
        .session(session)
        .lean<{ status: "ACTIVE" | "REVOKED" } | null>();
      await MatchingBlock.findOneAndUpdate(
        { blockerId: input.actorId, blockedId: input.targetId },
        {
          $set: { status: "ACTIVE" },
          $unset: { revokedAt: 1 },
          $setOnInsert: {
            blockerId: input.actorId,
            blockedId: input.targetId,
            participantKey,
          },
        },
        { upsert: true, new: true, session },
      );

      await CandidatePresentationGrant.updateMany(
        {
          $or: [
            { requesterId: input.actorId, candidateId: input.targetId },
            { requesterId: input.targetId, candidateId: input.actorId },
          ],
          revokedAt: { $exists: false },
        },
        { $set: { revokedAt: now } },
        { session },
      );

      await Like.updateMany(
        {
          $or: [
            { fromId: input.actorId, toId: input.targetId },
            { fromId: input.targetId, toId: input.actorId },
          ],
          status: { $in: ACTIVE_LIKE_STATUSES },
        },
        {
          $set: { status: "BLOCKED", updatedAt: now },
          $inc: { revision: 1 },
        },
        { session },
      );

      const connection = await MatchingConnection.findOne({
        participantKey,
        pairId: { $exists: false },
        status: { $in: [...MATCHING_OCCUPIED_STATUSES] },
      })
        .session(session)
        .lean<StoredConnection | null>();
      if (connection && connection.status !== "BLOCKED") {
        const transition = matchingConnectionTransition(
          connectionSnapshot(connection),
          { type: "BLOCK", at: now },
          input.actorId,
        );
        const updated = await MatchingConnection.updateOne(
          {
            _id: connection._id,
            revision: connection.revision,
            pairId: { $exists: false },
          },
          {
            $set: {
              status: transition.next.status,
              stage: transition.next.stage,
              coupleConfirmation: transition.next.coupleConfirmation,
              revision: transition.next.revision,
              updatedAt: now,
            },
          },
          { session },
        );
        if (updated.modifiedCount !== 1) {
          return stateConflict("Matching connection changed while blocking");
        }
      }

      if (previous?.status !== "ACTIVE") {
        await effects.record({
          effectKey: `matching-block:${input.actorId}:${input.targetId}:active:${now.toISOString()}`,
          name: "MATCHING_BLOCKED",
          actorId: input.actorId,
          participantIds,
          resourceId: participantKey,
          auditRequest: input.auditRequest,
          session,
          now,
        });
      }
      return {
        participantKey,
        status: "ACTIVE",
        noop: previous?.status === "ACTIVE",
      };
    });
  };

  const unblockParticipant = async (
    input: BlockMatchingParticipantInput,
  ): Promise<MatchingBlockMutationResult> => {
    await connectToDatabase();
    const participantIds = matchingParticipantIds(
      input.actorId,
      input.targetId,
    );
    const participantKey = matchingParticipantKey(
      input.actorId,
      input.targetId,
    );
    const now = input.now ?? new Date();
    return runTransaction(async (session) => {
      const blockRecord = await MatchingBlock.findOne({
        blockerId: input.actorId,
        blockedId: input.targetId,
      })
        .session(session)
        .lean<{ status: "ACTIVE" | "REVOKED" } | null>();
      if (!blockRecord) return resourceNotFound();
      if (blockRecord.status === "REVOKED") {
        return { participantKey, status: "REVOKED", noop: true };
      }
      const updated = await MatchingBlock.updateOne(
        {
          blockerId: input.actorId,
          blockedId: input.targetId,
          status: "ACTIVE",
        },
        { $set: { status: "REVOKED", revokedAt: now } },
        { session },
      );
      if (updated.modifiedCount !== 1) {
        return stateConflict("Matching block changed while it was revoked");
      }
      await effects.record({
        effectKey: `matching-block:${input.actorId}:${input.targetId}:revoked:${now.toISOString()}`,
        name: "MATCHING_UNBLOCKED",
        actorId: input.actorId,
        participantIds,
        resourceId: participantKey,
        auditRequest: input.auditRequest,
        session,
        now,
      });
      // Revocation intentionally does not resurrect Likes or connections.
      return { participantKey, status: "REVOKED", noop: false };
    });
  };

  const getConnection = async (input: {
    actorId: string;
    connectionId: string;
  }): Promise<MatchingConnectionResult> => {
    await connectToDatabase();
    const connection = await findConnectionForActor(
      input.connectionId,
      input.actorId,
    );
    return connectionResult(connection, true);
  };

  const confirmConnection = async (
    input: ConfirmMatchingConnectionInput,
  ): Promise<MatchingConnectionResult> => {
    await connectToDatabase();
    const now = input.now ?? new Date();
    return runTransaction(async (session) => {
      let connection = await findConnectionForActor(
        input.connectionId,
        input.actorId,
        session,
      );
      await dependencies.participantFence.fence({
        participantIds: matchingParticipantIds(
          connection.participantIds[0],
          connection.participantIds[1],
        ),
        session,
      });
      if (await activeBlockExists(connection.participantKey, session)) {
        return blocked();
      }
      if (input.action === "REQUEST" || input.action === "CONFIRM") await assertMatchingSolo(connection.participantIds, session);
      const action = { type: input.action, at: now } as const;
      const transition = matchingConnectionTransition(
        connectionSnapshot(connection),
        action,
        input.actorId,
      );
      if (transition.outcome === "NOOP") {
        return connectionResult(connection, true);
      }

      const transitionedConnection = await MatchingConnection.findOneAndUpdate(
        {
          _id: connection._id,
          participantIds: input.actorId,
          revision: connection.revision,
          status: connection.status,
          stage: connection.stage,
        },
        {
          $set: {
            stage: transition.next.stage,
            status: transition.next.status,
            coupleConfirmation: transition.next.coupleConfirmation,
            revision: transition.next.revision,
            updatedAt: now,
          },
        },
        { new: true, session },
      ).lean<StoredConnection | null>();
      if (!transitionedConnection) {
        return stateConflict("Matching connection changed during confirmation");
      }
      connection = transitionedConnection;
      if (input.action === "CLOSE") await Like.updateMany({ connectionId: connection._id, status: "MATCHED" }, { $set: { status: "EXPIRED", updatedAt: now }, $inc: { revision: 1 } }, { session });

      if (["REQUEST", "CONFIRM", "CANCEL"].includes(input.action)) {
      const effectName =
        input.action === "REQUEST"
          ? "COUPLE_CONFIRMATION_REQUESTED"
          : input.action === "CONFIRM"
            ? "COUPLE_CONFIRMATION_CONFIRMED"
            : "COUPLE_CONFIRMATION_CANCELLED";
      await effects.record({
        effectKey: `matching-connection:${String(connection._id)}:${input.action}:${transition.next.coupleConfirmation.revision}`,
        name: effectName,
        actorId: input.actorId,
        participantIds: matchingParticipantIds(
          connection.participantIds[0],
          connection.participantIds[1],
        ),
        resourceId: String(connection._id),
        auditRequest: input.auditRequest,
        session,
        now,
      });

      }

      if (input.action !== "CONFIRM") {
        return connectionResult(connection, false);
      }

      const pair = await dependencies.pairFormation.formFromMatchingConnection({
        connectionId: String(connection._id),
        participantIds: matchingParticipantIds(
          connection.participantIds[0],
          connection.participantIds[1],
        ),
        sourceLikeIds: connection.sourceLikeIds,
        session,
        now,
      });
      if (!Types.ObjectId.isValid(pair.pairId)) {
        throw new Error("Pair formation port returned an invalid Pair id");
      }
      const pairTransition = matchingConnectionTransition(
        connectionSnapshot(connection),
        { type: "PAIR_FORMED", pairId: pair.pairId, at: now },
        "SYSTEM",
      );
      const linked = await MatchingConnection.findOneAndUpdate(
        {
          _id: connection._id,
          revision: connection.revision,
          pairId: { $exists: false },
          stage: "COUPLE_CONFIRMED",
          status: "ACTIVE",
        },
        {
          $set: {
            pairId: new Types.ObjectId(pair.pairId),
            revision: pairTransition.next.revision,
            updatedAt: now,
          },
        },
        { new: true, session },
      ).lean<StoredConnection | null>();
      if (!linked) {
        return stateConflict("Connection changed while Pair was formed");
      }
      await effects.record({
        effectKey: `matching-connection:${String(linked._id)}:pair:${pair.pairId}`,
        name: "PAIR_FORMED_FROM_MATCHING",
        actorId: input.actorId,
        participantIds: matchingParticipantIds(
          linked.participantIds[0],
          linked.participantIds[1],
        ),
        resourceId: String(linked._id),
        pairId: pair.pairId,
        auditRequest: input.auditRequest,
        session,
        now,
      });
      return connectionResult(linked, pair.alreadyFormed);
    });
  };

  return {
    createLike,
    markLikeViewed,
    respondToLike,
    acceptLike,
    declineLike,
    withdrawLike,
    blockParticipant,
    unblockParticipant,
    getConnection,
    confirmConnection,
  };
};
