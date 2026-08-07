import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { SafetyGate, type SafetyGateType } from '@/models/SafetyGate';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';

export type OwnerSafetyGateDTO = {
  enabled: boolean;
  retentionClass: 'UNTIL_REVOKED_OR_PAIR_END';
  updatedAt?: string;
};

type StoredSafetyGate = SafetyGateType & { _id: Types.ObjectId };

const ensurePairMember = async (pairId: string, ownerUserId: string) => {
  const guard = await requirePairMember(pairId, ownerUserId);
  if (!guard.ok) {
    throw new DomainError({
      code: guard.response.status === 403 ? 'ACCESS_DENIED' : 'NOT_FOUND',
      status: guard.response.status,
      message: guard.response.status === 403 ? 'forbidden' : 'pair not found',
    });
  }
  if (guard.data.pair.status === 'ended') {
    throw new DomainError({
      code: 'STATE_CONFLICT',
      status: 409,
      message: 'Safety controls are unavailable for an ended pair',
    });
  }
  return guard.data.pair;
};

const toOwnerDTO = (gate: StoredSafetyGate | null): OwnerSafetyGateDTO => ({
  enabled: gate?.enabled === true,
  retentionClass: 'UNTIL_REVOKED_OR_PAIR_END',
  ...(gate?.updatedAt ? { updatedAt: gate.updatedAt.toISOString() } : {}),
});

export const getOwnerSafetyGate = async (input: {
  pairId: string;
  ownerUserId: string;
}): Promise<OwnerSafetyGateDTO> => {
  await connectToDatabase();
  await ensurePairMember(input.pairId, input.ownerUserId);
  const gate = await SafetyGate.findOne({
    pairId: input.pairId,
    ownerUserId: input.ownerUserId,
  }).lean<StoredSafetyGate | null>();
  return toOwnerDTO(gate);
};

export const setOwnerSafetyGate = async (input: {
  pairId: string;
  ownerUserId: string;
  enabled: boolean;
  auditRequest?: AuditRequestContext;
}): Promise<OwnerSafetyGateDTO> => {
  await connectToDatabase();
  await ensurePairMember(input.pairId, input.ownerUserId);
  const now = new Date();
  const gate = await SafetyGate.findOneAndUpdate(
    { pairId: input.pairId, ownerUserId: input.ownerUserId },
    {
      $set: {
        enabled: input.enabled,
        retentionClass: 'UNTIL_REVOKED_OR_PAIR_END',
        ...(input.enabled ? {} : { revokedAt: now }),
      },
      ...(input.enabled ? { $unset: { revokedAt: 1 } } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean<StoredSafetyGate | null>();
  if (!gate) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Safety control was not saved',
    });
  }
  await emitEvent({
    event: 'SAFETY_GATE_UPDATED',
    actor: { userId: input.ownerUserId },
    request: input.auditRequest ?? {
      route: '/api/users/me/safety-gate',
      method: 'PUT',
    },
    context: { pairId: input.pairId },
    target: { type: 'pair', id: input.pairId },
    metadata: {
      pairId: input.pairId,
      enabled: input.enabled,
      retentionClass: 'UNTIL_REVOKED_OR_PAIR_END',
    },
  });
  return toOwnerDTO(gate);
};

export const isPairSafetyVetoActive = async (pairId: string): Promise<boolean> => {
  await connectToDatabase();
  return Boolean(await SafetyGate.exists({ pairId, enabled: true }));
};

const SAFETY_FALLBACK_TEMPLATE_IDS = new Set([
  'system-resource-phone-free',
  'system-resource-relief',
]);

export const isSafetyFallbackTemplateId = (templateId?: string): boolean =>
  typeof templateId === 'string' && SAFETY_FALLBACK_TEMPLATE_IDS.has(templateId);
