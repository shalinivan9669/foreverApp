import { clearEmbeddedSessionBearerToken, http } from './http';

type LogoutResponse = {
  revoked: true;
};

export const authApi = {
  logoutAll: async (): Promise<void> => {
    await http.post<LogoutResponse, Record<string, never>>(
      '/api/auth/logout',
      {},
      { idempotency: true }
    );
    clearEmbeddedSessionBearerToken();
  },
};
