import { http } from './http';
import type { ApiJsonObject } from './types';

export type PrivacyDeletionRequestStatus =
  | 'PENDING_CONFIRMATION'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'FAILED'
  | 'CANCELLED';

export type PrivacyDeletionRequestDTO = {
  id: string;
  kind: 'ACCOUNT_DELETION';
  status: PrivacyDeletionRequestStatus;
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

type DeletionStatusResponse = {
  request: PrivacyDeletionRequestDTO | null;
};

type DeletionCancelResponse = DeletionStatusResponse & {
  cancelled: boolean;
};

export type DeletionExecuteResponse = {
  request: PrivacyDeletionRequestDTO;
  deleted: true;
};

export const privacyApi = {
  getOwnerExport: (signal?: AbortSignal): Promise<ApiJsonObject> =>
    http.get<ApiJsonObject>('/api/privacy/export', {
      signal,
      cache: 'no-store',
    }),

  getDeletionRequest: async (
    signal?: AbortSignal
  ): Promise<PrivacyDeletionRequestDTO | null> => {
    const response = await http.get<DeletionStatusResponse>(
      '/api/privacy/deletion-request',
      { signal, cache: 'no-store' }
    );
    return response.request;
  },

  requestDeletion: async (): Promise<PrivacyDeletionRequestDTO> => {
    const response = await http.post<
      DeletionStatusResponse,
      Record<string, never>
    >('/api/privacy/deletion-request', {});
    if (!response.request) {
      throw new Error('Deletion request was not returned');
    }
    return response.request;
  },

  cancelDeletion: async (): Promise<DeletionCancelResponse> =>
    http.delete<DeletionCancelResponse>('/api/privacy/deletion-request'),

  executeDeletion: (): Promise<DeletionExecuteResponse> =>
    http.post<DeletionExecuteResponse, { confirmation: 'DELETE_ACCOUNT' }>(
      '/api/privacy/deletion-request/execute',
      { confirmation: 'DELETE_ACCOUNT' }
    ),
};
