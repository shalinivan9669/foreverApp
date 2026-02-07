import { jsonError } from '@/lib/api/response';

export type AuthErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_SESSION'
  | 'ACCESS_DENIED';

export type ResourceErrorCode = 'NOT_FOUND';

type ErrorCode = AuthErrorCode | ResourceErrorCode;

const jsonAuthError = (
  status: 401 | 403 | 404,
  message: string,
  code: ErrorCode
) => jsonError(status, code, message);

export const jsonUnauthorized = (
  code: AuthErrorCode = 'AUTH_REQUIRED',
  error = 'unauthorized'
) => jsonAuthError(401, error, code);

export const jsonForbidden = (
  code: AuthErrorCode = 'ACCESS_DENIED',
  error = 'forbidden'
) => jsonAuthError(403, error, code);

export const jsonNotFound = (
  code: ResourceErrorCode = 'NOT_FOUND',
  error = 'not found'
) => jsonAuthError(404, error, code);
