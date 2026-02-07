import { NextRequest, NextResponse } from 'next/server';
import type { ZodIssue, ZodSchema } from 'zod';
import { jsonError, type JsonValue } from '@/lib/api/response';

type ParseOk<T> = { ok: true; data: T };
type ParseFail = { ok: false; response: NextResponse };

export type ParseResult<T> = ParseOk<T> | ParseFail;

type RouteParamValue = string | string[] | undefined;
type RouteParams = Record<string, RouteParamValue>;

type ValidationIssue = {
  path: string;
  message: string;
  code: string;
};

type ValidationDetails = {
  issues: ValidationIssue[];
};

const issuePath = (path: (string | number)[]): string =>
  path.map((part) => String(part)).join('.');

const validationErrorResponse = (issues: ValidationIssue[]): NextResponse =>
  jsonError(400, 'VALIDATION_ERROR', 'Validation failed', { issues });

const zodIssuesToDetails = (issues: ZodIssue[]): ValidationDetails => ({
  issues: issues.map((issue) => ({
    path: issuePath(issue.path),
    message: issue.message,
    code: issue.code,
  })),
});

const validateWithSchema = <T>(input: JsonValue | RouteParams, schema: ZodSchema<T>): ParseResult<T> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, response: validationErrorResponse(zodIssuesToDetails(parsed.error.issues).issues) };
  }
  return { ok: true, data: parsed.data };
};

export async function parseJson<T>(
  req: Request | NextRequest,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  let body: JsonValue;
  try {
    body = (await req.json()) as JsonValue;
  } catch {
    return {
      ok: false,
      response: validationErrorResponse([
        { path: '', message: 'Invalid JSON body', code: 'invalid_json' },
      ]),
    };
  }
  return validateWithSchema(body, schema);
}

const queryParamsToObject = (searchParams: URLSearchParams): JsonValue => {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
      continue;
    }
    if (Array.isArray(existing)) {
      query[key] = [...existing, value];
      continue;
    }
    query[key] = [existing, value];
  }
  return query;
};

export function parseQuery<T>(
  req: Request | NextRequest,
  schema: ZodSchema<T>
): ParseResult<T> {
  const { searchParams } = new URL(req.url);
  return validateWithSchema(queryParamsToObject(searchParams), schema);
}

export function parseParams<T>(
  params: RouteParams,
  schema: ZodSchema<T>
): ParseResult<T> {
  return validateWithSchema(params, schema);
}
