import mongoose, { Types, type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { Pair } from '@/models/Pair';
import { SafetyGate, type SafetyGateType } from '@/models/SafetyGate';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';

export type OwnerSafetyGateDTO = {
  enabled: boolean;
  retentionClass: 'UNTIL_REVOKED_OR_PAIR_END';
  updatedAt?: string;
};

type StoredSafetyGate = SafetyGateType & { _id: Types.ObjectId };

export type SafetyGateReliabilityTestHooks = {
  beforeTransactionalPairGuard?: () => Promise<void>;
};

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
}, hooks: SafetyGateReliabilityTestHooks = {}): Promise<OwnerSafetyGateDTO> => {
  await connectToDatabase();
  const pair = await ensurePairMember(input.pairId, input.ownerUserId);
  const now = new Date();
  let gate: StoredSafetyGate | null = null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await hooks.beforeTransactionalPairGuard?.();
      const activePair = await Pair.findOneAndUpdate(
        {
          _id: pair._id,
          members: input.ownerUserId,
          status: { $in: ['active', 'paused'] },
        },
        { $inc: { lifecycleRevision: 1 } },
        { new: false, session, timestamps: false }
      )
        .select({ _id: 1 })
        .lean<{ _id: Types.ObjectId } | null>();
      if (!activePair) {
        throw new DomainError({
          code: 'STATE_CONFLICT',
          status: 409,
          message: 'Safety controls are unavailable after pair end',
        });
      }
      gate = await SafetyGate.findOneAndUpdate(
        { pairId: pair._id, ownerUserId: input.ownerUserId },
        {
          $set: {
            enabled: input.enabled,
            retentionClass: 'UNTIL_REVOKED_OR_PAIR_END',
            ...(input.enabled ? {} : { revokedAt: now }),
          },
          ...(input.enabled ? { $unset: { revokedAt: 1 } } : {}),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          session,
        }
      ).lean<StoredSafetyGate | null>();
    });
  } finally {
    await session.endSession();
  }
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
      retentionClass: 'UNTIL_REVOKED_OR_PAIR_END',
    },
  });
  return toOwnerDTO(gate);
};

export const isOwnerSafetyGateActive = async (input: {
  pairId: string;
  ownerUserId: string;
  session?: ClientSession;
}): Promise<boolean> => {
  await connectToDatabase();
  return Boolean(
    await SafetyGate.exists({
      pairId: input.pairId,
      ownerUserId: input.ownerUserId,
      enabled: true,
    }).session(input.session ?? null)
  );
};

const SAFETY_FALLBACK_TEMPLATE_IDS = new Set([
  'system-resource-phone-free',
  'system-resource-relief',
]);

export const isSafetyFallbackTemplateId = (templateId?: string): boolean =>
  typeof templateId === 'string' && SAFETY_FALLBACK_TEMPLATE_IDS.has(templateId);
