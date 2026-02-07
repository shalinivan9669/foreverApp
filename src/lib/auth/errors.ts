import { NextResponse } from 'next/server';

export type AuthErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_SESSION'
  | 'AUTH_FORBIDDEN';

export type ResourceErrorCode = 'RESOURCE_NOT_FOUND';

type ErrorCode = AuthErrorCode | ResourceErrorCode;

type ErrorPayload = {
  error: string;
  code: ErrorCode;
};

const jsonAuthError = (
  status: 401 | 403 | 404,
  error: string,
  code: ErrorCode
) => NextResponse.json<ErrorPayload>({ error, code }, { status });

export const jsonUnauthorized = (
  code: AuthErrorCode = 'AUTH_REQUIRED',
  error = 'unauthorized'
) => jsonAuthError(401, error, code);

export const jsonForbidden = (
  code: AuthErrorCode = 'AUTH_FORBIDDEN',
  error = 'forbidden'
) => jsonAuthError(403, error, code);

export const jsonNotFound = (
  code: ResourceErrorCode = 'RESOURCE_NOT_FOUND',
  error = 'not found'
) => jsonAuthError(404, error, code);
