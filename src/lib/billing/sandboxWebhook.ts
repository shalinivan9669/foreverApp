import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import type { JsonValue } from '@/lib/api/response';
import { SUBSCRIPTION_STATUS_VALUES } from '@/lib/entitlements/types';

const MAX_WEBHOOK_BYTES = 32 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export const sandboxWebhookSchema = z
  .object({
    eventType: z.enum(['subscription.updated', 'subscription.deleted']),
    occurredAt: z.string().datetime(),
    version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    subscriptionId: z.string().min(1).max(160),
    pairId: z.string().regex(/^[a-f0-9]{24}$/i),
    billingOwnerUserId: z.string().min(1).max(128),
    plan: z.literal('COUPLE'),
    status: z.enum(SUBSCRIPTION_STATUS_VALUES),
    periodEnd: z.string().datetime().optional(),
  })
  .strict();

export type SandboxWebhookPayload = z.infer<typeof sandboxWebhookSchema>;

export const readSandboxWebhookBody = async (request: Request): Promise<string> => {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'application/json') {
    throw new DomainError({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      status: 415,
      message: 'application/json is required',
    });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    throw new DomainError({
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      message: 'Payload is too large',
    });
  }

  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_WEBHOOK_BYTES) {
      await reader.cancel();
      throw new DomainError({
        code: 'PAYLOAD_TOO_LARGE',
        status: 413,
        message: 'Payload is too large',
      });
    }
    chunks.push(chunk.value);
  }

  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(combined);
  } catch {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Invalid webhook payload',
    });
  }
};

export const parseSandboxWebhook = (rawBody: string): SandboxWebhookPayload => {
  let json: JsonValue;
  try {
    json = JSON.parse(rawBody) as JsonValue;
  } catch {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Invalid webhook payload',
    });
  }
  const parsed = sandboxWebhookSchema.safeParse(json);
  if (!parsed.success) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Invalid webhook payload',
    });
  }
  return parsed.data;
};

export const hashSandboxWebhookPayload = (rawBody: string): string =>
  createHash('sha256').update(rawBody).digest('hex');

export const signSandboxWebhook = (input: {
  secret: string;
  timestamp: string;
  eventId: string;
  rawBody: string;
}): string =>
  createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.eventId}.${input.rawBody}`)
    .digest('hex');

export const verifySandboxWebhook = (input: {
  secret: string;
  timestamp: string;
  eventId: string;
  rawBody: string;
  signature: string;
  now?: Date;
}): boolean => {
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isInteger(timestampSeconds)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;
  if (!/^[a-f0-9]{64}$/i.test(input.signature)) return false;

  const expected = signSandboxWebhook(input);
  const providedBuffer = Buffer.from(input.signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
};
