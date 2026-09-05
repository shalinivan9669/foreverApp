import { ApiClientError } from './errors';
import { http, type HttpRequestOptions } from './http';
import type { ApiJsonObject, ApiJsonValue } from './types';

export type PairInviteStatus = 'ACTIVE' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';

export type PairInviteOwnerDTO = {
  id: string;
  status: PairInviteStatus;
  expiresAt: string;
  token?: string;
  awaitingOwnerConfirmation?: boolean;
  partner?: PairingIdentityDTO;
  pairId?: string;
};

export type PairingIdentityDTO = { publicId: string; username: string };
export type PairInviteLookup = { token: string } | { partnerCode: string };

export type PairInviteAvailabilityDTO = {
  availability: 'available' | 'waiting_confirmation' | 'accepted' | 'unavailable';
  partner?: PairingIdentityDTO;
  pairId?: string;
};

export type PairInviteAcceptDTO = {
  status: 'ACCEPTED' | 'AWAITING_PARTNER_CONFIRMATION';
  pairId?: string;
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

const normalizeIdentity = (value: ApiJsonValue | undefined): PairingIdentityDTO | undefined => {
  if (value === undefined) return undefined;
  if (!isObject(value) || typeof value.publicId !== 'string' || typeof value.username !== 'string') return invalidPayload('Invalid partner identity');
  return { publicId: value.publicId, username: value.username };
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
    ...(value.awaitingOwnerConfirmation === true ? { awaitingOwnerConfirmation: true } : {}),
    ...(value.partner ? { partner: normalizeIdentity(value.partner) } : {}),
    ...(typeof value.pairId === 'string' ? { pairId: value.pairId } : {}),
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
    if (
      availability === 'available' ||
      availability === 'accepted' ||
      availability === 'unavailable'
    ) {
      return { availability };
    }
  }

  const rawState = payload.state;
  const identity = { ...(payload.partner ? { partner: normalizeIdentity(payload.partner) } : {}), ...(typeof payload.pairId === 'string' ? { pairId: payload.pairId } : {}) };
  if (typeof rawState === 'string') {
    const state = rawState.toUpperCase();
    if (state === 'AVAILABLE') return { availability: 'available', ...identity };
    if (state === 'WAITING_CONFIRMATION') return { availability: 'waiting_confirmation', ...identity };
    if (state === 'ACCEPTED') return { availability: 'accepted', ...identity };
    if (state === 'UNAVAILABLE') return { availability: 'unavailable' };
  }

  return invalidPayload('Invalid pair invite availability');
};

const normalizeAccept = (payload: ApiJsonValue): PairInviteAcceptDTO => {
  if (!isObject(payload)) return invalidPayload('Invalid pair invite acceptance');
  if (payload.status === 'AWAITING_PARTNER_CONFIRMATION') return { status: 'AWAITING_PARTNER_CONFIRMATION' };
  if (typeof payload.pairId !== 'string' || !payload.pairId) {
    return invalidPayload('Invalid pair invite acceptance');
  }
  return { status: 'ACCEPTED', pairId: payload.pairId };
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
        {}
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
        {}
      )
    );
    return invite ?? invalidPayload('Pair invite was not reissued');
  },

  resolve: async (
    lookup: string | PairInviteLookup,
    signal?: AbortSignal
  ): Promise<PairInviteAvailabilityDTO> =>
    normalizeAvailability(
      await http.post<ApiJsonValue, PairInviteLookup>(
        '/api/pair-invites/resolve',
        typeof lookup === 'string' ? { token: lookup } : lookup,
        signal ? { signal } : undefined
      )
    ),

  accept: async (lookup: string | PairInviteLookup): Promise<PairInviteAcceptDTO> =>
    normalizeAccept(
      await http.post<ApiJsonValue, PairInviteLookup & { confirmation: 'THIS_IS_MY_PARTNER' }>(
        '/api/pair-invites/accept',
        { ...(typeof lookup === 'string' ? { token: lookup } : lookup), confirmation: 'THIS_IS_MY_PARTNER' },
        { idempotency: true }
      )
    ),
  confirm: async (inviteId: string, partnerPublicId: string): Promise<PairInviteAcceptDTO> => normalizeAccept(
    await http.post<ApiJsonValue, { partnerPublicId: string; confirmation: 'THIS_IS_MY_PARTNER' }>(
      `/api/pair-invites/${encodeURIComponent(inviteId)}/confirm`,
      { partnerPublicId, confirmation: 'THIS_IS_MY_PARTNER' },
      { idempotency: true },
    ),
  ),
};
