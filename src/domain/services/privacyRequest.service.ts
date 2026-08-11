import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { connectToDatabase } from '@/lib/mongodb';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import {
  PrivacyRequest,
  type PrivacyRequestStatus,
} from '@/models/PrivacyRequest';

export type OwnerDeletionRequestDTO = {
  id: string;
  kind: 'ACCOUNT_DELETION';
  status: PrivacyRequestStatus;
  requestVersion: 'privacy-request-v2';
  policyReasonCode: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION';
  executionState: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  accountAndSessions: 'UNCHANGED' | 'DELETED_AND_REVOKED';
  requestedAt: string;
  confirmedAt?: string;
  executedAt?: string;
  cancelledAt?: string;
  nextStep:
    | 'CONFIRM_DELETION'
    | 'EXECUTION_IN_PROGRESS'
    | 'RETRY_EXECUTION'
    | 'NO_ACTION_REQUIRED';
};

export type PrivacyRequestProjection = {
  _id: { toString(): string };
  kind: 'ACCOUNT_DELETION';
  status: PrivacyRequestStatus;
  requestVersion: 'privacy-request-v2';
  policyReasonCode: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION';
  ownerSubjectHash: string;
  requestedAt: Date;
  confirmedAt?: Date;
  executedAt?: Date;
  cancelledAt?: Date;
};

const executionState = (
  status: PrivacyRequestStatus
): OwnerDeletionRequestDTO['executionState'] => {
  if (status === 'EXECUTING') return 'IN_PROGRESS';
  if (status === 'EXECUTED') return 'COMPLETED';
  if (status === 'FAILED') return 'FAILED';
  return 'NOT_STARTED';
};

const nextStep = (
  status: PrivacyRequestStatus
): OwnerDeletionRequestDTO['nextStep'] => {
  if (status === 'PENDING_CONFIRMATION') return 'CONFIRM_DELETION';
  if (status === 'EXECUTING') return 'EXECUTION_IN_PROGRESS';
  if (status === 'FAILED') return 'RETRY_EXECUTION';
  return 'NO_ACTION_REQUIRED';
};

export const toOwnerDeletionRequestDTO = (
  request: PrivacyRequestProjection
): OwnerDeletionRequestDTO => ({
  id: request._id.toString(),
  kind: request.kind,
  status: request.status,
  requestVersion: request.requestVersion,
  policyReasonCode: request.policyReasonCode,
  executionState: executionState(request.status),
  accountAndSessions:
    request.status === 'EXECUTED' ? 'DELETED_AND_REVOKED' : 'UNCHANGED',
  requestedAt: request.requestedAt.toISOString(),
  ...(request.confirmedAt
    ? { confirmedAt: request.confirmedAt.toISOString() }
    : {}),
  ...(request.executedAt ? { executedAt: request.executedAt.toISOString() } : {}),
  ...(request.cancelledAt
    ? { cancelledAt: request.cancelledAt.toISOString() }
    : {}),
  nextStep: nextStep(request.status),
});

const projection = {
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

const currentFilter = (ownerUserId: string) => ({
  ownerUserId,
  kind: 'ACCOUNT_DELETION' as const,
  status: { $in: ['PENDING_CONFIRMATION', 'EXECUTING', 'FAILED'] },
});

const findCurrent = async (
  ownerUserId: string
): Promise<PrivacyRequestProjection | null> =>
  PrivacyRequest.findOne(currentFilter(ownerUserId))
    .sort({ createdAt: -1 })
    .select(projection)
    .lean<PrivacyRequestProjection | null>();

export const privacyRequestService = {
  async getCurrent(ownerUserId: string): Promise<OwnerDeletionRequestDTO | null> {
    await connectToDatabase();
    const request = await findCurrent(assertOwnerUserId(ownerUserId));
    return request ? toOwnerDeletionRequestDTO(request) : null;
  },

  async requestDeletion(params: {
    ownerUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<OwnerDeletionRequestDTO> {
    await connectToDatabase();
    const ownerUserId = assertOwnerUserId(params.ownerUserId);
    const existing = await findCurrent(ownerUserId);
    if (existing) return toOwnerDeletionRequestDTO(existing);

    const now = new Date();
    let request: PrivacyRequestProjection | null;
    try {
      request = await PrivacyRequest.findOneAndUpdate(
        {
          ownerUserId,
          kind: 'ACCOUNT_DELETION',
          status: 'PENDING_CONFIRMATION',
        },
        {
          $setOnInsert: {
            ownerUserId,
            ownerSubjectHash: privacySubjectHash(ownerUserId),
            kind: 'ACCOUNT_DELETION',
            status: 'PENDING_CONFIRMATION',
            requestVersion: 'privacy-request-v2',
            policyReasonCode: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION',
            requestedAt: now,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          projection,
        }
      ).lean<PrivacyRequestProjection | null>();
    } catch (error) {
      if (
        !(error instanceof mongoose.mongo.MongoServerError) ||
        error.code !== 11000
      ) {
        throw error;
      }
      request = await findCurrent(ownerUserId);
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
          status: 'PENDING_CONFIRMATION',
          requestVersion: 'privacy-request-v2',
        },
      });
    }

    return toOwnerDeletionRequestDTO(request);
  },

  async cancelDeletion(params: {
    ownerUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<OwnerDeletionRequestDTO | null> {
    await connectToDatabase();
    const ownerUserId = assertOwnerUserId(params.ownerUserId);
    const request = await PrivacyRequest.findOneAndUpdate(
      {
        ownerUserId,
        kind: 'ACCOUNT_DELETION',
        status: 'PENDING_CONFIRMATION',
      },
      { $set: { status: 'CANCELLED', cancelledAt: new Date() } },
      { new: true, projection }
    ).lean<PrivacyRequestProjection | null>();

    if (request && params.auditRequest) {
      await emitEvent({
        event: 'PRIVACY_DELETION_CANCELLED',
        actor: { userId: ownerUserId },
        request: params.auditRequest,
        target: { type: 'user', id: ownerUserId },
        metadata: {
          status: 'CANCELLED',
          requestVersion: 'privacy-request-v2',
        },
      });
    }

    return request ? toOwnerDeletionRequestDTO(request) : null;
  },
};
