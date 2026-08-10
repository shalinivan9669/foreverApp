import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { connectToDatabase } from '@/lib/mongodb';
import {
  PrivacyRequest,
  type PrivacyRequestStatus,
} from '@/models/PrivacyRequest';

export type OwnerDeletionRequestDTO = {
  id: string;
  kind: 'ACCOUNT_DELETION';
  status: PrivacyRequestStatus;
  requestVersion: 'privacy-request-v1';
  policyReasonCode: 'SHARED_ARTIFACT_RETENTION_REQUIRED';
  executionState: 'NOT_STARTED';
  accountAndSessions: 'UNCHANGED';
  requestedAt: string;
  cancelledAt?: string;
  nextStep: 'RETENTION_POLICY_REVIEW' | 'NO_ACTION_REQUIRED';
};

type PrivacyRequestProjection = {
  _id: { toString(): string };
  kind: 'ACCOUNT_DELETION';
  status: PrivacyRequestStatus;
  requestVersion: 'privacy-request-v1';
  policyReasonCode: 'SHARED_ARTIFACT_RETENTION_REQUIRED';
  requestedAt: Date;
  cancelledAt?: Date;
};

const toDto = (request: PrivacyRequestProjection): OwnerDeletionRequestDTO => ({
  id: request._id.toString(),
  kind: request.kind,
  status: request.status,
  requestVersion: request.requestVersion,
  policyReasonCode: request.policyReasonCode,
  executionState: 'NOT_STARTED',
  accountAndSessions: 'UNCHANGED',
  requestedAt: request.requestedAt.toISOString(),
  ...(request.cancelledAt
    ? { cancelledAt: request.cancelledAt.toISOString() }
    : {}),
  nextStep:
    request.status === 'PENDING_POLICY_REVIEW'
      ? 'RETENTION_POLICY_REVIEW'
      : 'NO_ACTION_REQUIRED',
});

const pendingFilter = (ownerUserId: string) => ({
  ownerUserId,
  kind: 'ACCOUNT_DELETION' as const,
  status: 'PENDING_POLICY_REVIEW' as const,
});

const assertOwnerUserId = (ownerUserId: string): string => {
  const normalized = ownerUserId.trim();
  if (!normalized || normalized.length > 128) {
    throw new DomainError({
      code: 'AUTH_INVALID_SESSION',
      status: 401,
      message: 'unauthorized',
    });
  }
  return normalized;
};

const findPending = async (
  ownerUserId: string
): Promise<PrivacyRequestProjection | null> =>
  PrivacyRequest.findOne(pendingFilter(ownerUserId))
    .select({
      kind: 1,
      status: 1,
      requestVersion: 1,
      policyReasonCode: 1,
      requestedAt: 1,
      cancelledAt: 1,
    })
    .lean<PrivacyRequestProjection | null>();

export const privacyRequestService = {
  async getCurrent(ownerUserId: string): Promise<OwnerDeletionRequestDTO | null> {
    await connectToDatabase();
    const request = await findPending(assertOwnerUserId(ownerUserId));
    return request ? toDto(request) : null;
  },

  async requestDeletion(params: {
    ownerUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<OwnerDeletionRequestDTO> {
    await connectToDatabase();
    const ownerUserId = assertOwnerUserId(params.ownerUserId);
    const now = new Date();
    let request: PrivacyRequestProjection | null;

    try {
      request = await PrivacyRequest.findOneAndUpdate(
        pendingFilter(ownerUserId),
        {
          $setOnInsert: {
            ownerUserId,
            kind: 'ACCOUNT_DELETION',
            status: 'PENDING_POLICY_REVIEW',
            requestVersion: 'privacy-request-v1',
            policyReasonCode: 'SHARED_ARTIFACT_RETENTION_REQUIRED',
            requestedAt: now,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          projection: {
            kind: 1,
            status: 1,
            requestVersion: 1,
            policyReasonCode: 1,
            requestedAt: 1,
            cancelledAt: 1,
          },
        }
      ).lean<PrivacyRequestProjection | null>();
    } catch (error) {
      if (
        !(error instanceof mongoose.mongo.MongoServerError) ||
        error.code !== 11000
      ) {
        throw error;
      }
      request = await findPending(ownerUserId);
    }

    if (!request) {
      throw new DomainError({
        code: 'PRIVACY_REQUEST_NOT_PERSISTED',
        status: 500,
        message: 'privacy request was not persisted',
      });
    }

    if (params.auditRequest) {
      await emitEvent({
        event: 'PRIVACY_DELETION_REQUESTED',
        actor: { userId: ownerUserId },
        request: params.auditRequest,
        target: { type: 'user', id: ownerUserId },
        metadata: {
          status: 'PENDING_POLICY_REVIEW',
          requestVersion: 'privacy-request-v1',
        },
      });
    }

    return toDto(request);
  },

  async cancelDeletion(params: {
    ownerUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<OwnerDeletionRequestDTO | null> {
    await connectToDatabase();
    const ownerUserId = assertOwnerUserId(params.ownerUserId);
    const request = await PrivacyRequest.findOneAndUpdate(
      pendingFilter(ownerUserId),
      {
        $set: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      },
      {
        new: true,
        projection: {
          kind: 1,
          status: 1,
          requestVersion: 1,
          policyReasonCode: 1,
          requestedAt: 1,
          cancelledAt: 1,
        },
      }
    ).lean<PrivacyRequestProjection | null>();

    if (request && params.auditRequest) {
      await emitEvent({
        event: 'PRIVACY_DELETION_CANCELLED',
        actor: { userId: ownerUserId },
        request: params.auditRequest,
        target: { type: 'user', id: ownerUserId },
        metadata: {
          status: 'CANCELLED',
          requestVersion: 'privacy-request-v1',
        },
      });
    }

    return request ? toDto(request) : null;
  },
};
