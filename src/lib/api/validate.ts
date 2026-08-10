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

export const MAX_JSON_BODY_BYTES = 64 * 1024;

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

const isJsonContentType = (value: string | null): boolean => {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase();
  if (!mediaType) return false;
  return mediaType === 'application/json' ||
    (mediaType.startsWith('application/') && mediaType.endsWith('+json'));
};

const payloadTooLargeResponse = (): NextResponse =>
  jsonError(413, 'PAYLOAD_TOO_LARGE', 'JSON body exceeds the allowed size', {
    maxBytes: MAX_JSON_BODY_BYTES,
  });

const readBoundedBody = async (
  req: Request | NextRequest
): Promise<{ ok: true; text: string } | { ok: false; response: NextResponse }> => {
  const contentLength = req.headers.get('content-length')?.trim();
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_JSON_BODY_BYTES) {
      return { ok: false, response: payloadTooLargeResponse() };
    }
  }

  if (!req.body) return { ok: true, text: '' };

  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytesRead = 0;
  let text = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      bytesRead += chunk.value.byteLength;
      if (bytesRead > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: payloadTooLargeResponse() };
      }

      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return {
      ok: false,
      response: validationErrorResponse([
        { path: '', message: 'Invalid JSON body', code: 'invalid_json' },
      ]),
    };
  }
};

export async function parseJson<T>(
  req: Request | NextRequest,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  if (!isJsonContentType(req.headers.get('content-type'))) {
    return {
      ok: false,
      response: jsonError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json'
      ),
    };
  }

  const rawBody = await readBoundedBody(req);
  if (!rawBody.ok) return rawBody;

  let body: JsonValue;
  try {
    body = JSON.parse(rawBody.text) as JsonValue;
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
