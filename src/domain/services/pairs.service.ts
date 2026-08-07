import type { HydratedDocument } from 'mongoose';
import type { PairType } from '@/models/Pair';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { pairTransition } from '@/domain/state/pairMachine';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';

type GuardErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

const guardFailureToDomainError = async (response: Response): Promise<DomainError> => {
  const payload = await response
    .clone()
    .json()
    .catch(() => null) as GuardErrorPayload | null;

  return new DomainError({
    code: payload?.error?.code ?? 'INTERNAL',
    status: response.status || 500,
    message: payload?.error?.message ?? 'Request failed',
  });
};

const ensurePairMember = async (
  pairId: string,
  currentUserId: string
): Promise<{ pair: HydratedDocument<PairType>; by: 'A' | 'B' }> => {
  const guard = await requirePairMember(pairId, currentUserId);
  if (!guard.ok) {
    throw await guardFailureToDomainError(guard.response);
  }
  return guard.data;
};

export const pairsService = {
  async createPair(input: {
    currentUserId: string;
    partnerId?: string;
    likeId?: string;
    auditRequest?: AuditRequestContext;
  }): Promise<{ pairId: string }> {
    void input;
    throw new DomainError({
      code: 'PAIR_INVITE_REQUIRED',
      status: 409,
      message: 'Use a consensual pair invitation',
    });
  },

  async pausePair(input: {
    pairId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);

    const transition = pairTransition(
      { status: pairData.pair.status },
      { type: 'PAUSE' },
      {
        currentUserId: input.currentUserId,
        role: pairData.by,
      }
    );

    pairData.pair.status = transition.next.status;
    await pairData.pair.save();

    await emitEvent({
      event: 'PAIR_PAUSED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: `/api/pairs/${input.pairId}/pause`, method: 'POST' },
      context: {
        pairId: input.pairId,
      },
      target: {
        type: 'pair',
        id: input.pairId,
      },
      metadata: {
        pairId: input.pairId,
      },
    });

    return {};
  },

  async resumePair(input: {
    pairId: string;
    currentUserId: string;
    auditRequest?: AuditRequestContext;
  }): Promise<Record<string, never>> {
    const pairData = await ensurePairMember(input.pairId, input.currentUserId);

    const transition = pairTransition(
      { status: pairData.pair.status },
      { type: 'RESUME' },
      {
        currentUserId: input.currentUserId,
        role: pairData.by,
      }
    );

    pairData.pair.status = transition.next.status;
    await pairData.pair.save();

    await emitEvent({
      event: 'PAIR_RESUMED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: `/api/pairs/${input.pairId}/resume`, method: 'POST' },
      context: {
        pairId: input.pairId,
      },
      target: {
        type: 'pair',
        id: input.pairId,
      },
      metadata: {
        pairId: input.pairId,
      },
    });

    return {};
  },
};
