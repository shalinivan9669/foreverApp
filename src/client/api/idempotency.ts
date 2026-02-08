export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

const fallbackUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });

export const createIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return fallbackUuid();
};

export type IdempotencyRequestOptions = {
  idempotencyKey?: string;
};

export const toIdempotencyHeaders = (
  options?: IdempotencyRequestOptions
): Record<string, string> | undefined => {
  const key = options?.idempotencyKey?.trim();
  if (!key) return undefined;
  return {
    [IDEMPOTENCY_KEY_HEADER]: key,
  };
};
