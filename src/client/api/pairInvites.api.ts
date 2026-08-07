import { ApiClientError } from './errors';
import { http, type HttpRequestOptions } from './http';
import type { ApiJsonObject, ApiJsonValue } from './types';

export type PairInviteStatus = 'ACTIVE' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';

export type PairInviteOwnerDTO = {
  id: string;
  status: PairInviteStatus;
  expiresAt: string;
  token?: string;
};

export type PairInviteAvailabilityDTO = {
  availability: 'available' | 'unavailable';
};

export type PairInviteAcceptDTO = {
  pairId: string;
};

const isObject = (value: ApiJsonValue | null): value is ApiJsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalidPayload = (message: string): never => {
  throw new ApiClientError({
    status: 500,
    code: 'INVALID_ENVELOPE',
    message,
  });
};

const normalizeStatus = (value: ApiJsonValue | undefined): PairInviteStatus => {
  if (typeof value !== 'string') {
    return invalidPayload('Invalid pair invite status');
  }

  const normalized = value.toUpperCase();
  if (
    normalized === 'ACTIVE' ||
    normalized === 'ACCEPTED' ||
    normalized === 'CANCELLED' ||
    normalized === 'EXPIRED'
  ) {
    return normalized;
  }

  return invalidPayload('Invalid pair invite status');
};

const normalizeInvite = (value: ApiJsonValue | null): PairInviteOwnerDTO | null => {
  if (value === null) return null;
  if (!isObject(value)) return invalidPayload('Invalid pair invite payload');

  const id = value.id;
  const expiresAt = value.expiresAt;
  const token = value.token;

  if (typeof id !== 'string' || !id || typeof expiresAt !== 'string' || !expiresAt) {
    return invalidPayload('Invalid pair invite payload');
  }

  return {
    id,
    status: normalizeStatus(value.status),
    expiresAt,
    ...(typeof token === 'string' && token ? { token } : {}),
  };
};

const normalizeOwnerResponse = (payload: ApiJsonValue): PairInviteOwnerDTO | null => {
  if (payload === null) return null;
  if (!isObject(payload)) return invalidPayload('Invalid pair invite response');

  if (Object.prototype.hasOwnProperty.call(payload, 'invite')) {
    const invite = normalizeInvite(payload.invite ?? null);
    const token = payload.token;
    return invite && typeof token === 'string' && token ? { ...invite, token } : invite;
  }

  return normalizeInvite(payload);
};

const normalizeAvailability = (payload: ApiJsonValue): PairInviteAvailabilityDTO => {
  if (!isObject(payload)) return invalidPayload('Invalid pair invite availability');

  const rawAvailability = payload.availability;
  if (typeof rawAvailability === 'string') {
    const availability = rawAvailability.toLowerCase();
    if (availability === 'available' || availability === 'unavailable') {
      return { availability };
    }
  }

  const rawState = payload.state;
  if (typeof rawState === 'string') {
    const state = rawState.toUpperCase();
    if (state === 'AVAILABLE') return { availability: 'available' };
    if (state === 'ACCEPTED' || state === 'UNAVAILABLE') {
      return { availability: 'unavailable' };
    }
  }

  return invalidPayload('Invalid pair invite availability');
};

const normalizeAccept = (payload: ApiJsonValue): PairInviteAcceptDTO => {
  if (!isObject(payload) || typeof payload.pairId !== 'string' || !payload.pairId) {
    return invalidPayload('Invalid pair invite acceptance');
  }
  return { pairId: payload.pairId };
};

const withSignalNoStore = (signal?: AbortSignal): HttpRequestOptions => ({
  ...(signal ? { signal } : {}),
  cache: 'no-store',
});

export const pairInvitesApi = {
  getCurrent: async (signal?: AbortSignal): Promise<PairInviteOwnerDTO | null> =>
    normalizeOwnerResponse(
      await http.get<ApiJsonValue>('/api/pair-invites', withSignalNoStore(signal))
    ),

  create: async (): Promise<PairInviteOwnerDTO> => {
    const invite = normalizeOwnerResponse(
      await http.post<ApiJsonValue, Record<string, never>>(
        '/api/pair-invites',
        {},
        { idempotency: true }
      )
    );
    return invite ?? invalidPayload('Pair invite was not created');
  },

  cancel: async (inviteId: string): Promise<PairInviteOwnerDTO> => {
    const invite = normalizeOwnerResponse(
      await http.post<ApiJsonValue, Record<string, never>>(
        `/api/pair-invites/${encodeURIComponent(inviteId)}/cancel`,
        {},
        { idempotency: true }
      )
    );
    return invite ?? invalidPayload('Pair invite was not cancelled');
  },

  reissue: async (inviteId: string): Promise<PairInviteOwnerDTO> => {
    const invite = normalizeOwnerResponse(
      await http.post<ApiJsonValue, Record<string, never>>(
        `/api/pair-invites/${encodeURIComponent(inviteId)}/reissue`,
        {},
        { idempotency: true }
      )
    );
    return invite ?? invalidPayload('Pair invite was not reissued');
  },

  resolve: async (
    token: string,
    signal?: AbortSignal
  ): Promise<PairInviteAvailabilityDTO> =>
    normalizeAvailability(
      await http.post<ApiJsonValue, { token: string }>(
        '/api/pair-invites/resolve',
        { token },
        signal ? { signal } : undefined
      )
    ),

  accept: async (token: string): Promise<PairInviteAcceptDTO> =>
    normalizeAccept(
      await http.post<ApiJsonValue, { token: string }>(
        '/api/pair-invites/accept',
        { token },
        { idempotency: true }
      )
    ),
};
