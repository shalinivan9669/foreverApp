type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export type ApiOk<T> = {
  ok: true;
  data: T;
  meta?: JsonObject;
};

export type ApiErr = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: JsonValue;
  };
};

export type ApiEnvelope<T> = ApiOk<T> | ApiErr;

type EnvelopeLike<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

export type FetchEnvelopeOptions = {
  idempotency?: boolean;
};

const fallbackUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });

const generateIdempotencyKey = (): string => {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return fallbackUuid();
};

const withIdempotencyHeader = (
  init: RequestInit | undefined,
  options: FetchEnvelopeOptions | undefined
): RequestInit | undefined => {
  if (!options?.idempotency) return init;

  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'POST' && method !== 'PATCH') return init;

  const headers = new Headers(init?.headers);
  if (!headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', generateIdempotencyKey());
  }

  return {
    ...init,
    headers,
  };
};

export async function fetchEnvelope<T>(
  url: string,
  init?: RequestInit,
  options?: FetchEnvelopeOptions
): Promise<T> {
  const requestInit = withIdempotencyHeader(init, options);
  const res = await fetch(url, {
    ...requestInit,
    credentials: 'include',
  });

  let payload: EnvelopeLike<T>;
  try {
    payload = (await res.json()) as EnvelopeLike<T>;
  } catch {
    throw new Error(`Invalid JSON response (${res.status})`);
  }

  if (payload.ok === false) {
    const code = payload.error?.code ?? 'API_ERROR';
    const message = payload.error?.message ?? `Request failed with status ${res.status}`;
    throw new Error(`${code}: ${message}`);
  }

  if (payload.ok !== true || !('data' in payload)) {
    throw new Error('Invalid API envelope');
  }

  return payload.data as T;
}
