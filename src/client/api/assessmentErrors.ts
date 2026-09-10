import { ApiClientError } from './errors';

/** The caught transport error is untrusted until narrowed at this UI boundary. */
export function assessmentErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.status === 401) return 'Сессия завершена. Войдите снова.';
  if (error.status === 403 || error.status === 404) return 'Раздел недоступен для текущего аккаунта.';
  if (error.code === 'INVALID_ENVELOPE' || error.code === 'NETWORK_ERROR' || error.status >= 500) return fallback;
  return error.message;
}
