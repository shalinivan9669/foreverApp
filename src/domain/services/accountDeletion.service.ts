import mongoose, { Types } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { accountWriteBarrierService } from '@/domain/services/accountWriteBarrier.service';
import { pairsService } from '@/domain/services/pairs.service';
import {
  toOwnerDeletionRequestDTO,
  type OwnerDeletionRequestDTO,
  type PrivacyRequestProjection,
} from '@/domain/services/privacyRequest.service';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { connectToDatabase } from '@/lib/mongodb';
import { PrivacyRequest } from '@/models/PrivacyRequest';
import { Pair } from '@/models/Pair';
import { User } from '@/models/User';

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

type PairIdProjection = { _id: Types.ObjectId };
type UserIdProjection = { _id: Types.ObjectId };

const pairScopedCollections = [
  'billing_webhook_events',
  'factor_evidence_events',
  'notifications',
  'pair_activities',
  'pair_events',
  'pair_factor_evaluation_snapshots',
  'pair_factor_snapshots',
  'pair_membership_claims',
  'pair_qn_answers',
  'pair_qn_sessions',
  'pair_state_snapshots',
  'partner_signals',
  'recommendation_decisions',
  'safety_gates',
  'subscriptions',
  'weekly_checkins',
  'weekly_cycles',
] as const;

const executeDeletion = async (input: {
  ownerUserId: string;
  request: PrivacyRequestProjection;
  now: Date;
  barrier: { subjectKey: string; generation: string };
}): Promise<PrivacyRequestProjection> => {
  const activePairs = await Pair.find({
    members: input.ownerUserId,
    status: { $in: ['active', 'paused'] },
  })
    .select({ _id: 1 })
    .lean<PairIdProjection[]>();

  for (const pair of activePairs) {
    await pairsService.endPair({
      pairId: String(pair._id),
      currentUserId: input.ownerUserId,
      reason: 'ACCOUNT_DELETION',
    });
  }

  const session = await mongoose.startSession();
  let completed: PrivacyRequestProjection | null = null;

  try {
    await session.withTransaction(async () => {
      const database = mongoose.connection.db;
      if (!database) throw new Error('DATABASE_NOT_CONNECTED');
      const [pairRows, user] = await Promise.all([
        Pair.find({ members: input.ownerUserId })
          .select({ _id: 1 })
          .session(session)
          .lean<PairIdProjection[]>(),
        User.findOne({ id: input.ownerUserId })
          .select({ _id: 1 })
          .session(session)
          .lean<UserIdProjection | null>(),
      ]);
      const pairIds = pairRows.map((pair) => pair._id);
      const pairIdStrings = pairIds.map((pairId) => String(pairId));
      const pairReferences: Array<Types.ObjectId | string> = [
        ...pairIds,
        ...pairIdStrings,
      ];

      for (const collectionName of pairScopedCollections) {
        await database.collection(collectionName).deleteMany(
          { pairId: { $in: pairReferences } },
          { session }
        );
      }

      await database.collection('pair_invites').deleteMany(
        {
          $or: [
            { creatorUserId: input.ownerUserId },
            { acceptedByUserId: input.ownerUserId },
            { pairId: { $in: pairReferences } },
          ],
        },
        { session }
      );
      await database.collection('likes').deleteMany(
        {
          $or: [
            { fromId: input.ownerUserId },
            { toId: input.ownerUserId },
          ],
        },
        { session }
      );
      await database.collection('partner_signals').deleteMany(
        {
          $or: [
            { fromUserId: input.ownerUserId },
            { toUserId: input.ownerUserId },
            { pairId: { $in: pairReferences } },
          ],
        },
        { session }
      );
      await database.collection('event_logs').deleteMany(
        {
          $or: [
            { 'actor.userId': input.ownerUserId },
            { 'context.pairId': { $in: pairIdStrings } },
          ],
        },
        { session }
      );
      await database.collection('insights').deleteMany(
        {
          $or: [
            { userId: input.ownerUserId },
            { pairId: { $in: pairReferences } },
          ],
        },
        { session }
      );
      await database.collection('subscriptions').deleteMany(
        {
          $or: [
            { userId: input.ownerUserId },
            { billingOwnerUserId: input.ownerUserId },
            { pairId: { $in: pairIds } },
          ],
        },
        { session }
      );
      await database.collection('entitlement_quota_usage').deleteMany(
        { subjectId: input.ownerUserId },
        { session }
      );
      await database.collection('rate_limit_buckets').deleteMany(
        { key: `user:${input.ownerUserId}` },
        { session }
      );
      await database.collection('idempotency_records').deleteMany(
        { userId: input.ownerUserId },
        { session }
      );
      await database.collection('mvp_onboarding_sessions').deleteMany(
        { userId: input.ownerUserId },
        { session }
      );
      await database.collection('personal_daily_checkins').deleteMany(
        { userId: input.ownerUserId },
        { session }
      );
      await database.collection('personal_questionnaire_submissions').deleteMany(
        { userId: input.ownerUserId },
        { session }
      );
      await database.collection('weekly_checkins').deleteMany(
        { userId: input.ownerUserId },
        { session }
      );
      await database.collection('vector_snapshots').deleteMany(
        {
          userId: {
            $in: [
              input.ownerUserId,
              ...(user ? [user._id] : []),
            ],
          },
        },
        { session }
      );
      await database.collection('individual_factor_snapshots').deleteMany(
        {
          $or: [
            { subjectId: input.ownerUserId },
          ],
        },
        { session }
      );
      await database.collection('factor_evidence_events').deleteMany(
        {
          $or: [
            { subjectId: input.ownerUserId },
            { actorId: input.ownerUserId },
            { observedSubjectId: input.ownerUserId },
            { pairId: { $in: pairReferences } },
          ],
        },
        { session }
      );
      // Retained solely for cleanup of pre-cutover rows in the legacy collection.
      await database.collection('evidence_events').deleteMany(
        {
          $or: [
            { subjectId: input.ownerUserId },
            { actorId: input.ownerUserId },
            { observedSubjectId: input.ownerUserId },
            { pairId: { $in: pairReferences } },
          ],
        },
        { session }
      );
      if (user) {
        await database.collection('relationshipactivities').deleteMany(
          {
            $or: [{ userId: user._id }, { partnerId: user._id }],
          },
          { session }
        );
      }
      await database.collection('pairs').deleteMany(
        { _id: { $in: pairIds } },
        { session }
      );
      await database.collection('users').deleteOne(
        { id: input.ownerUserId },
        { session }
      );

      await accountWriteBarrierService.markDeleted({
        subjectKey: input.barrier.subjectKey,
        generation: input.barrier.generation,
        now: input.now,
        session,
      });

      const deletedSubject = `deleted:${input.request.ownerSubjectHash}`;
      await PrivacyRequest.updateMany(
        {
          ownerUserId: input.ownerUserId,
          _id: { $ne: input.request._id },
        },
        { $set: { ownerUserId: deletedSubject } },
        { session }
      );

      completed = await PrivacyRequest.findOneAndUpdate(
        { _id: input.request._id, status: 'EXECUTING' },
        {
          $set: {
            ownerUserId: deletedSubject,
            status: 'EXECUTED',
            executedAt: input.now,
          },
          $unset: { failureCode: 1 },
        },
        { new: true, projection: requestProjection, session }
      ).lean<PrivacyRequestProjection | null>();

      if (!completed) throw new Error('PRIVACY_REQUEST_COMPLETION_NOT_PERSISTED');
    });
  } finally {
    await session.endSession();
  }

  if (!completed) throw new Error('PRIVACY_REQUEST_COMPLETION_NOT_PERSISTED');
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
        kind: 'ACCOUNT_DELETION',
        status: { $in: ['PENDING_CONFIRMATION', 'FAILED'] },
      },
      {
        $set: { status: 'EXECUTING', confirmedAt: now },
        $unset: { failureCode: 1 },
      },
      { new: true, projection: requestProjection }
    ).lean<PrivacyRequestProjection | null>();

    if (!request) {
      throw new DomainError({
        code: 'PRIVACY_DELETION_NOT_CONFIRMABLE',
        status: 409,
        message: 'Create a deletion request before confirming deletion',
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
        event: 'PRIVACY_DELETION_EXECUTED',
        actor: { userId: deletedSubject },
        request: input.auditRequest,
        target: { type: 'user', id: deletedSubject },
        metadata: {
          status: 'EXECUTED',
          requestVersion: 'privacy-request-v2',
          deletionPolicy: 'PRIVACY_MINIMAL',
        },
      });
      return toOwnerDeletionRequestDTO(completed);
    } catch (error) {
      await PrivacyRequest.updateOne(
        { _id: request._id, status: 'EXECUTING' },
        {
          $set: {
            status: 'FAILED',
            failureCode: 'DELETION_EXECUTION_FAILED',
          },
        }
      );
      throw error;
    }
  },
};
