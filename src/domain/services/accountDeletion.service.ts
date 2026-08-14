import mongoose, { Types } from "mongoose";
import { DomainError } from "@/domain/errors";
import { accountWriteBarrierService } from "@/domain/services/accountWriteBarrier.service";
import { pairsService } from "@/domain/services/pairs.service";
import {
  toOwnerDeletionRequestDTO,
  type OwnerDeletionRequestDTO,
  type PrivacyRequestProjection,
} from "@/domain/services/privacyRequest.service";
import { emitEvent } from "@/lib/audit/emitEvent";
import type { AuditRequestContext } from "@/lib/audit/eventTypes";
import { connectToDatabase } from "@/lib/mongodb";
import { PrivacyRequest } from "@/models/PrivacyRequest";
import { Pair } from "@/models/Pair";
import { User } from "@/models/User";

const requestProjection = {
  kind: 1,
  status: 1,
  requestVersion: 1,
  policyReasonCode: 1,
  ownerSubjectHash: 1,
  requestedAt: 1,
  confirmedAt: 1,
  executedAt: 1,
  cancelledAt: 1,
} as const;

type PairIdProjection = {
  _id: Types.ObjectId;
  members: [string, string];
  endedByUserId?: string;
};
type UserIdProjection = { _id: Types.ObjectId };
type PairActivityDeletionRow = {
  pairId: Types.ObjectId | string;
  members: Types.ObjectId[];
  answers: Array<{ by: "A" | "B" }>;
};
type PairQuestionnaireSessionDeletionRow = {
  pairId: Types.ObjectId | string;
  members: Types.ObjectId[];
};
type WeeklyCycleDeletionRow = {
  pairId: Types.ObjectId | string;
  memberIds: string[];
  memberCompletion: Array<{ userId: string }>;
  submissionClaims: Array<{ userId: string }>;
};
type PairStateSnapshotDeletionRow = {
  pairId: Types.ObjectId | string;
  memberCompletion: Array<{ userId: string }>;
};

const AUDIT_USER_REFERENCE_PATHS = [
  "actor.userId",
  "target.id",
  "metadata.userId",
  "metadata.toUserId",
  "metadata.blockedUserId",
  "metadata.unblockedUserId",
] as const;

const executeDeletion = async (input: {
  ownerUserId: string;
  request: PrivacyRequestProjection;
  now: Date;
  barrier: { subjectKey: string; generation: string };
}): Promise<PrivacyRequestProjection> => {
  const database = mongoose.connection.db;
  if (!database) throw new Error("DATABASE_NOT_CONNECTED");
  const deletedSubject = `deleted:${input.request.ownerSubjectHash}`;
  const deletedOwnerObjectId = new Types.ObjectId(
    input.request.ownerSubjectHash.slice(0, 24),
  );
  const activePairs = await Pair.find({
    members: input.ownerUserId,
    status: { $in: ["active", "paused"] },
  })
    .select({ _id: 1, members: 1 })
    .lean<PairIdProjection[]>();

  for (const pair of activePairs) {
    const survivorIds = pair.members.filter(
      (memberId) => memberId !== input.ownerUserId,
    );
    const retainedNotifications = await database
      .collection("notifications")
      .find({ pairId: pair._id, userId: { $in: survivorIds } })
      .toArray();
    try {
      await pairsService.endPair({
        pairId: String(pair._id),
        currentUserId: input.ownerUserId,
        reason: "ACCOUNT_DELETION",
      });
    } finally {
      if (retainedNotifications.length > 0) {
        await database.collection("notifications").bulkWrite(
          retainedNotifications.map((notification) => ({
            updateOne: {
              filter: { _id: notification._id },
              update: { $setOnInsert: notification },
              upsert: true,
            },
          })),
        );
      }
    }
  }

  const session = await mongoose.startSession();
  let completed: PrivacyRequestProjection | null = null;

  try {
    await session.withTransaction(async () => {
      // MongoDB transactions do not support concurrent operations on the same
      // ClientSession. Both reads stay bounded and run against one snapshot.
      const pairRows = await Pair.find({ members: input.ownerUserId })
        .select({ _id: 1, members: 1, endedByUserId: 1 })
        .session(session)
        .lean<PairIdProjection[]>();
      const user = await User.findOne({ id: input.ownerUserId })
        .select({ _id: 1 })
        .session(session)
        .lean<UserIdProjection | null>();
      const pairIds = pairRows.map((pair) => pair._id);
      const pairIdStrings = pairIds.map((pairId) => String(pairId));
      const pairReferences: Array<Types.ObjectId | string> = [
        ...pairIds,
        ...pairIdStrings,
      ];
      const ownerQuestionnaireClauses = pairRows.map((pair) => ({
        pairId: pair._id,
        by: pair.members[0] === input.ownerUserId ? "A" : "B",
      }));

      await database.collection("pair_invites").deleteMany(
        {
          $or: [
            { creatorUserId: input.ownerUserId },
            { acceptedByUserId: input.ownerUserId },
          ],
        },
        { session },
      );
      await database.collection("pair_membership_claims").deleteMany(
        {
          $or: [
            { userId: input.ownerUserId },
            { pairId: { $in: pairReferences } },
          ],
        },
        { session },
      );
      await database
        .collection("notifications")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database.collection("likes").deleteMany(
        {
          $or: [{ fromId: input.ownerUserId }, { toId: input.ownerUserId }],
        },
        { session },
      );
      await database
        .collection("matching_profiles")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database
        .collection("partner_preference_profiles")
        .deleteMany({ ownerId: input.ownerUserId }, { session });
      await database
        .collection("matching_use_grants")
        .deleteMany({ ownerId: input.ownerUserId }, { session });
      await database
        .collection("candidate_discovery_projections")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database.collection("candidate_presentation_grants").deleteMany(
        {
          $or: [
            { requesterId: input.ownerUserId },
            { candidateId: input.ownerUserId },
          ],
        },
        { session },
      );
      await database
        .collection("matching_feed_sessions")
        .deleteMany({ requesterId: input.ownerUserId }, { session });
      await database.collection("matching_evaluation_snapshots").deleteMany(
        {
          $or: [
            { requesterId: input.ownerUserId },
            { candidateId: input.ownerUserId },
          ],
        },
        { session },
      );
      await database.collection("matching_blocks").deleteMany(
        {
          $or: [
            { blockerId: input.ownerUserId },
            { blockedId: input.ownerUserId },
          ],
        },
        { session },
      );
      await database
        .collection("matching_connections")
        .deleteMany({ participantIds: input.ownerUserId }, { session });
      await database.collection("matching_social_effects").deleteMany(
        {
          $or: [
            { actorId: input.ownerUserId },
            { participantIds: input.ownerUserId },
          ],
        },
        { session },
      );
      if (ownerQuestionnaireClauses.length > 0) {
        await database
          .collection("pair_qn_answers")
          .deleteMany({ $or: ownerQuestionnaireClauses }, { session });
      }
      for (const pair of pairRows) {
        const ownerRole =
          pair.members[0] === input.ownerUserId
            ? ("A" as const)
            : ("B" as const);
        const pairFilter = {
          pairId: { $in: [pair._id, String(pair._id)] },
        };
        if (user) {
          await database
            .collection<PairActivityDeletionRow>("pair_activities")
            .updateMany(
              pairFilter,
              {
                $pull: { answers: { by: ownerRole } },
                $set: {
                  "members.$[deletedMember]": deletedOwnerObjectId,
                },
              },
              {
                arrayFilters: [{ deletedMember: user._id }],
                session,
              },
            );
          await database
            .collection<PairQuestionnaireSessionDeletionRow>("pair_qn_sessions")
            .updateMany(
              pairFilter,
              {
                $set: {
                  "members.$[deletedMember]": deletedOwnerObjectId,
                },
              },
              {
                arrayFilters: [{ deletedMember: user._id }],
                session,
              },
            );
        }
        await database
          .collection<WeeklyCycleDeletionRow>("weekly_cycles")
          .updateMany(
            pairFilter,
            {
              $set: {
                "memberIds.$[deletedMember]": deletedSubject,
                "memberCompletion.$[deletedCompletion].userId": deletedSubject,
              },
              $pull: { submissionClaims: { userId: input.ownerUserId } },
            },
            {
              arrayFilters: [
                { deletedMember: input.ownerUserId },
                { "deletedCompletion.userId": input.ownerUserId },
              ],
              session,
            },
          );
        await database
          .collection<PairStateSnapshotDeletionRow>("pair_state_snapshots")
          .updateMany(
            pairFilter,
            {
              $set: {
                "memberCompletion.$[deletedCompletion].userId": deletedSubject,
              },
            },
            {
              arrayFilters: [{ "deletedCompletion.userId": input.ownerUserId }],
              session,
            },
          );
        await database
          .collection("pair_factor_evaluation_snapshots")
          .updateMany(
            { ...pairFilter, memberAId: input.ownerUserId },
            { $set: { memberAId: deletedSubject } },
            { session },
          );
        await database
          .collection("pair_factor_evaluation_snapshots")
          .updateMany(
            { ...pairFilter, memberBId: input.ownerUserId },
            { $set: { memberBId: deletedSubject } },
            { session },
          );

        const redactedMembers = pair.members.map((memberId) =>
          memberId === input.ownerUserId ? deletedSubject : memberId,
        ) as [string, string];
        await database.collection("pairs").updateOne(
          { _id: pair._id },
          {
            $set: {
              members: redactedMembers,
              key: [...redactedMembers].sort().join("|"),
              ...(pair.endedByUserId === input.ownerUserId
                ? { endedByUserId: deletedSubject }
                : {}),
            },
          },
          { session },
        );
      }
      await database
        .collection("safety_gates")
        .deleteMany({ ownerUserId: input.ownerUserId }, { session });
      await database.collection("partner_signals").deleteMany(
        {
          $or: [
            { fromUserId: input.ownerUserId },
            { toUserId: input.ownerUserId },
          ],
        },
        { session },
      );
      const pairAuditFilter = {
        "context.pairId": { $in: pairIdStrings },
      };
      for (const path of AUDIT_USER_REFERENCE_PATHS) {
        await database
          .collection("event_logs")
          .updateMany(
            { ...pairAuditFilter, [path]: input.ownerUserId },
            { $set: { [path]: deletedSubject } },
            { session },
          );
      }
      await database.collection("event_logs").updateMany(
        { ...pairAuditFilter, "metadata.members": input.ownerUserId },
        {
          $set: {
            "metadata.members.$[deletedMember]": deletedSubject,
          },
        },
        {
          arrayFilters: [{ deletedMember: input.ownerUserId }],
          session,
        },
      );
      await database.collection("event_logs").deleteMany(
        {
          $or: [
            ...AUDIT_USER_REFERENCE_PATHS.map((path) => ({
              [path]: input.ownerUserId,
            })),
            { "metadata.members": input.ownerUserId },
          ],
        },
        { session },
      );
      await database
        .collection("insights")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database.collection("subscriptions").deleteMany(
        {
          $or: [
            { userId: input.ownerUserId },
            { billingOwnerUserId: input.ownerUserId },
          ],
        },
        { session },
      );
      await database
        .collection("entitlement_quota_usage")
        .deleteMany({ subjectId: input.ownerUserId }, { session });
      await database
        .collection("rate_limit_buckets")
        .deleteMany({ key: `user:${input.ownerUserId}` }, { session });
      await database
        .collection("idempotency_records")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database
        .collection("mvp_onboarding_sessions")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database
        .collection("personal_daily_checkins")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database
        .collection("personal_questionnaire_submissions")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database
        .collection("weekly_checkins")
        .deleteMany({ userId: input.ownerUserId }, { session });
      await database.collection("vector_snapshots").deleteMany(
        {
          userId: {
            $in: [input.ownerUserId, ...(user ? [user._id] : [])],
          },
        },
        { session },
      );
      await database.collection("individual_factor_snapshots").deleteMany(
        {
          $or: [{ subjectId: input.ownerUserId }],
        },
        { session },
      );
      await database.collection("factor_evidence_events").deleteMany(
        {
          $or: [
            { subjectId: input.ownerUserId },
            { actorId: input.ownerUserId },
            { observedSubjectId: input.ownerUserId },
          ],
        },
        { session },
      );
      // Retained solely for cleanup of pre-cutover rows in the legacy collection.
      await database.collection("evidence_events").deleteMany(
        {
          $or: [
            { subjectId: input.ownerUserId },
            { actorId: input.ownerUserId },
            { observedSubjectId: input.ownerUserId },
          ],
        },
        { session },
      );
      if (user) {
        await database.collection("relationshipactivities").deleteMany(
          {
            $or: [{ userId: user._id }, { partnerId: user._id }],
          },
          { session },
        );
      }
      await database
        .collection("users")
        .deleteOne({ id: input.ownerUserId }, { session });

      await accountWriteBarrierService.markDeleted({
        subjectKey: input.barrier.subjectKey,
        generation: input.barrier.generation,
        now: input.now,
        session,
      });

      await PrivacyRequest.updateMany(
        {
          ownerUserId: input.ownerUserId,
          _id: { $ne: input.request._id },
        },
        { $set: { ownerUserId: deletedSubject } },
        { session },
      );

      completed = await PrivacyRequest.findOneAndUpdate(
        { _id: input.request._id, status: "EXECUTING" },
        {
          $set: {
            ownerUserId: deletedSubject,
            status: "EXECUTED",
            executedAt: input.now,
          },
          $unset: { failureCode: 1 },
        },
        { new: true, projection: requestProjection, session },
      ).lean<PrivacyRequestProjection | null>();

      if (!completed)
        throw new Error("PRIVACY_REQUEST_COMPLETION_NOT_PERSISTED");
    });
  } finally {
    await session.endSession();
  }

  if (!completed) throw new Error("PRIVACY_REQUEST_COMPLETION_NOT_PERSISTED");
  return completed;
};

export const accountDeletionService = {
  async execute(input: {
    ownerUserId: string;
    sessionVersion: string;
    auditRequest: AuditRequestContext;
    reliabilityTestHooks?: {
      afterBarrierStarted?: () => void | Promise<void>;
      onBarrierWait?: (leaseCount: number) => void | Promise<void>;
      barrierNow?: () => Date;
      barrierSleep?: (milliseconds: number) => Promise<void>;
      barrierMaxWaitMs?: number;
    };
  }): Promise<OwnerDeletionRequestDTO> {
    await connectToDatabase();
    const now = new Date();
    const request = await PrivacyRequest.findOneAndUpdate(
      {
        ownerUserId: input.ownerUserId,
        kind: "ACCOUNT_DELETION",
        status: { $in: ["PENDING_CONFIRMATION", "FAILED"] },
      },
      {
        $set: { status: "EXECUTING", confirmedAt: now },
        $unset: { failureCode: 1 },
      },
      { new: true, projection: requestProjection },
    ).lean<PrivacyRequestProjection | null>();

    if (!request) {
      throw new DomainError({
        code: "PRIVACY_DELETION_NOT_CONFIRMABLE",
        status: 409,
        message: "Create a deletion request before confirming deletion",
      });
    }

    try {
      const barrier = await accountWriteBarrierService.beginDeletion({
        userId: input.ownerUserId,
        sessionVersion: input.sessionVersion,
        now,
      });
      await input.reliabilityTestHooks?.afterBarrierStarted?.();
      await accountWriteBarrierService.waitForQuiescence({
        ...barrier,
        ...(input.reliabilityTestHooks?.barrierMaxWaitMs === undefined
          ? {}
          : { maxWaitMs: input.reliabilityTestHooks.barrierMaxWaitMs }),
        ...(input.reliabilityTestHooks?.barrierNow
          ? { now: input.reliabilityTestHooks.barrierNow }
          : {}),
        ...(input.reliabilityTestHooks?.barrierSleep
          ? { sleep: input.reliabilityTestHooks.barrierSleep }
          : {}),
        ...(input.reliabilityTestHooks?.onBarrierWait
          ? { onWait: input.reliabilityTestHooks.onBarrierWait }
          : {}),
      });
      const completed = await executeDeletion({
        ownerUserId: input.ownerUserId,
        request,
        now,
        barrier,
      });
      const deletedSubject = `deleted:${request.ownerSubjectHash}`;
      await emitEvent({
        event: "PRIVACY_DELETION_EXECUTED",
        actor: { userId: deletedSubject },
        request: input.auditRequest,
        target: { type: "user", id: deletedSubject },
        metadata: {
          status: "EXECUTED",
          requestVersion: "privacy-request-v2",
          deletionPolicy: "PRIVACY_MINIMAL",
        },
      });
      return toOwnerDeletionRequestDTO(completed);
    } catch (error) {
      await PrivacyRequest.updateOne(
        { _id: request._id, status: "EXECUTING" },
        {
          $set: {
            status: "FAILED",
            failureCode: "DELETION_EXECUTION_FAILED",
          },
        },
      );
      throw error;
    }
  },
};
