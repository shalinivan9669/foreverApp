import { ApiClientError, readRetryAfterMs } from './errors';
import type { ApiJsonObject, ApiJsonValue } from './types';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type EnvelopeOk<T> = {
  ok: true;
  data: T;
  meta?: ApiJsonObject;
};

type EnvelopeErr = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: ApiJsonValue;
  };
};

type Envelope<T> = EnvelopeOk<T> | EnvelopeErr;

type HttpBody = ApiJsonObject | ApiJsonValue[];

export type HttpRequestOptions = {
  signal?: AbortSignal;
  headers?: HeadersInit;
  idempotency?: boolean;
  cache?: RequestCache;
};

const MUTATION_METHODS: HttpMethod[] = ['POST', 'PATCH', 'PUT', 'DELETE'];

const fallbackUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });

const createIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return fallbackUuid();
};

const toProxyPath = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/.proxy/')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const proxyPrefix = typeof window !== 'undefined' ? '/.proxy' : '';
  return `${proxyPrefix}${normalized}`;
};

const isObject = (value: ApiJsonValue | null): value is ApiJsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseEnvelope = <T>(payload: ApiJsonValue | null): Envelope<T> | null => {
  if (!isObject(payload)) return null;
  const { ok } = payload;

  if (ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return {
      ok: true,
      data: payload.data as T,
      meta: isObject(payload.meta as ApiJsonValue | null) ? (payload.meta as ApiJsonObject) : undefined,
    };
  }

  if (ok === false && isObject(payload.error as ApiJsonValue | null)) {
    const errorPayload = payload.error as ApiJsonObject;
    const code = typeof errorPayload.code === 'string' ? errorPayload.code : 'INTERNAL';
    const message =
      typeof errorPayload.message === 'string'
        ? errorPayload.message
        : 'Request failed';
    return {
      ok: false,
      error: {
        code,
        message,
        details: errorPayload.details,
      },
    };
  }

  return null;
};

const parseJson = async (response: Response): Promise<ApiJsonValue | null> => {
  try {
    return (await response.json()) as ApiJsonValue;
  } catch {
    return null;
  }
};

const request = async <TResponse>(
  method: HttpMethod,
  path: string,
  body?: HttpBody,
  options?: HttpRequestOptions
): Promise<TResponse> => {
  const url = toProxyPath(path);
  const headers = new Headers(options?.headers);

  const hasBody = body !== undefined && method !== 'GET';
  if (hasBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options?.idempotency && MUTATION_METHODS.includes(method) && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', createIdempotencyKey());
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      signal: options?.signal,
      cache: options?.cache,
      credentials: 'include',
      body: hasBody ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message,
    });
  }

  const payload = await parseJson(response);
  const envelope = parseEnvelope<TResponse>(payload);
  if (!envelope) {
    throw new ApiClientError({
      status: response.status,
      code: 'INVALID_ENVELOPE',
      message: `Invalid API envelope (${method} ${path})`,
    });
  }

  if (!envelope.ok) {
    throw new ApiClientError({
      status: response.status,
      code: envelope.error.code,
      message: envelope.error.message,
      details: envelope.error.details,
      retryAfterMs: readRetryAfterMs(envelope.error.details, response.headers.get('Retry-After')),
    });
  }

  return envelope.data;
};

export const http = {
  get: <TResponse>(path: string, options?: HttpRequestOptions): Promise<TResponse> =>
    request<TResponse>('GET', path, undefined, options),
  post: <TResponse, TBody extends HttpBody>(
    path: string,
    body: TBody,
    options?: HttpRequestOptions
  ): Promise<TResponse> => request<TResponse>('POST', path, body, options),
  patch: <TResponse, TBody extends HttpBody>(
    path: string,
    body: TBody,
    options?: HttpRequestOptions
  ): Promise<TResponse> => request<TResponse>('PATCH', path, body, options),
  put: <TResponse, TBody extends HttpBody>(
    path: string,
    body: TBody,
    options?: HttpRequestOptions
  ): Promise<TResponse> => request<TResponse>('PUT', path, body, options),
};
