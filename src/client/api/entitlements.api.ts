import { http } from './http';
import type { EntitlementsGrantRequest, EntitlementsGrantResponse } from './types';

export const entitlementsApi = {
  grantDevPlan: (payload: EntitlementsGrantRequest): Promise<EntitlementsGrantResponse> =>
    http.post<EntitlementsGrantResponse, EntitlementsGrantRequest>(
      '/api/entitlements/grant',
      payload,
      { idempotency: true }
    ),
};
