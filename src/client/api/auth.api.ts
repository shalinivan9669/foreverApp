import { clearEmbeddedSessionBearerToken, http } from './http';
import { announceSessionChange } from './sessionEvents';

type LogoutResponse = {
  revoked: true;
};

export const authApi = {
  logoutAll: async (): Promise<void> => {
    try { await http.post<LogoutResponse, Record<string, never>>(
      '/api/auth/logout',
      {},
      { idempotency: true }
    ); } finally {
      clearEmbeddedSessionBearerToken();
      announceSessionChange();
    }
  },
};
