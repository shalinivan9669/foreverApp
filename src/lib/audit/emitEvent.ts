import { isIP } from 'node:net';
import { connectToDatabase } from '@/lib/mongodb';
import { EventLog } from '@/models/EventLog';
import {
  getEventExpiresAt,
  getRetentionTier,
  type AuditEventName,
  type AuditRequestContext,
  type EmitEventInput,
  type EventRetentionTier,
} from '@/lib/audit/eventTypes';
import type { JsonValue } from '@/lib/api/response';

type JsonObject = { [key: string]: JsonValue };
type MetadataScalar = string | number | boolean | null;
type MetadataValue = MetadataScalar | MetadataScalar[] | Record<string, MetadataScalar>;
type EventMetadata = Record<string, MetadataValue>;

const SENSITIVE_METADATA_KEYS = new Set([
  'access_token',
  'refresh_token',
  'token',
  'code',
  'redirect_uri',
  'authorization',
  'cookie',
  'password',
  'secret',
  'email',
  'phone',
  'messages',
  'message',
  'raw',
  'body',
  'answers',
  'checkins',
  'confidence',
  'sumweightstotal',
  'deltamagnitude',
  'appliedstepbyaxis',
  'clampedaxes',
  'weights',
  'deltas',
  'axissteps',
  'matchscore',
]);

const sanitizeString = (value: string): string => value.slice(0, 512);

const isPlainObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeMetadataValue = (value: JsonValue, depth = 0): JsonValue => {
  if (depth >= 6) {
    return '[TRUNCATED]';
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item, depth + 1));
  }

  const sanitized: JsonObject = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (SENSITIVE_METADATA_KEYS.has(normalized)) {
      continue;
    }

    sanitized[key] = sanitizeMetadataValue(raw, depth + 1);
  }

  return sanitized;
};

const toMetadataScalar = (value: JsonValue): MetadataScalar => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return null;
};

const toMetadataValue = (value: JsonValue): MetadataValue => {
  if (Array.isArray(value)) {
    return value.map((entry) => toMetadataScalar(entry));
  }

  if (isPlainObject(value)) {
    const objectValue: Record<string, MetadataScalar> = {};
    for (const [key, entry] of Object.entries(value)) {
      objectValue[key] = toMetadataScalar(entry);
    }
    return objectValue;
  }

  return toMetadataScalar(value);
};

const toStoredMetadata = (value: JsonValue): EventMetadata => {
  if (!isPlainObject(value)) {
    return { value: toMetadataValue(value) };
  }

  const metadata: EventMetadata = {};
  for (const [key, entry] of Object.entries(value)) {
    metadata[key] = toMetadataValue(entry);
  }

  return metadata;
};

export type TrustedProxyMode = 'none' | 'x-forwarded-for';

export const parseTrustedProxyMode = (
  value: string | undefined
): TrustedProxyMode =>
  value?.trim().toLowerCase() === 'x-forwarded-for'
    ? 'x-forwarded-for'
    : 'none';

const firstValidForwardedIp = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const first = value.split(',', 1)[0]?.trim();
  if (!first || first.length > 64 || isIP(first) === 0) return undefined;
  return first;
};

export const clientIpFromRequest = (
  req: Request,
  trustedProxyMode: TrustedProxyMode = parseTrustedProxyMode(
    process.env.TRUSTED_PROXY_MODE
  )
): string | undefined => {
  if (trustedProxyMode !== 'x-forwarded-for') return undefined;
  return firstValidForwardedIp(req.headers.get('x-forwarded-for'));
};

const safeRouteFromUrl = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '/unknown';
  }
};

export const auditContextFromRequest = (
  req: Request,
  routeOverride?: string,
  options?: { trustedProxyMode?: TrustedProxyMode }
): AuditRequestContext => {
  const route = routeOverride ?? safeRouteFromUrl(req.url);

  return {
    route,
    method: req.method.toUpperCase(),
    ip: clientIpFromRequest(req, options?.trustedProxyMode),
    ua: req.headers.get('user-agent') ?? undefined,
  };
};

type EmitEventResult = {
  id: string;
  event: AuditEventName;
  ts: number;
  retentionTier: EventRetentionTier;
  expiresAt: Date;
};

export async function emitEvent<E extends AuditEventName>(
  input: EmitEventInput<E>
): Promise<EmitEventResult | null> {
  const ts = input.ts ?? Date.now();
  const retentionTier = getRetentionTier(input.event);
  const expiresAt = getEventExpiresAt(input.event, ts);
  const safeActorUserId = input.actor.userId.trim() || 'anonymous';

  try {
    await connectToDatabase();
    const doc = await EventLog.create({
      event: input.event,
      ts,
      actor: {
        userId: safeActorUserId,
      },
      context: input.context,
      target: input.target,
      request: input.request,
      metadata: toStoredMetadata(sanitizeMetadataValue(input.metadata as JsonValue)),
      retentionTier,
      expiresAt,
    });

    return {
      id: String(doc._id),
      event: input.event,
      ts,
      retentionTier,
      expiresAt,
    };
  } catch (error: unknown) {
    console.error('emitEvent failed', {
      event: input.event,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
