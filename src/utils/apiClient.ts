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

export async function fetchEnvelope<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

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
