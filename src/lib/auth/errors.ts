import { NextResponse } from 'next/server';

export type AuthErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_SESSION'
  | 'AUTH_FORBIDDEN';

type ErrorPayload = {
  error: string;
  code: AuthErrorCode;
};

const jsonAuthError = (
  status: 401 | 403,
  error: string,
  code: AuthErrorCode
) => NextResponse.json<ErrorPayload>({ error, code }, { status });

export const jsonUnauthorized = (
  code: AuthErrorCode = 'AUTH_REQUIRED',
  error = 'unauthorized'
) => jsonAuthError(401, error, code);

export const jsonForbidden = (
  code: AuthErrorCode = 'AUTH_FORBIDDEN',
  error = 'forbidden'
) => jsonAuthError(403, error, code);

