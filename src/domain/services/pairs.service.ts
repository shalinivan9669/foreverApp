import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import { Like, type LikeType } from '@/models/Like';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { pairTransition } from '@/domain/state/pairMachine';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { buildPairPassport } from '@/domain/services/pairDiagnostics.service';

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

const getPairRole = (members: [string, string], currentUserId: string): 'A' | 'B' =>
  members[0] === currentUserId ? 'A' : 'B';

export const pairsService = {
  async createPair(input: {
    currentUserId: string;
    partnerId?: string;
    likeId?: string;
    auditRequest?: AuditRequestContext;
  }): Promise<{ pairId: string }> {
    await connectToDatabase();

    const aId = input.currentUserId;
    const directPartnerId = input.partnerId?.trim() ?? '';
    if (directPartnerId) {
      throw new DomainError({
        code: 'PAIR_INVITE_REQUIRED',
        status: 409,
        message: 'Use a consensual pair invitation',
      });
    }

    let bId = '';

    if (!bId && input.likeId) {
      if (!Types.ObjectId.isValid(input.likeId)) {
        throw new DomainError({
          code: 'LIKE_NOT_FOUND',
          status: 404,
          message: 'Like not found',
        });
      }

      const like = await Like.findById(input.likeId).lean<LikeType | null>();
      if (!like) {
        throw new DomainError({
          code: 'LIKE_NOT_FOUND',
          status: 404,
          message: 'Like not found',
        });
      }

      if (like.fromId !== aId && like.toId !== aId) {
        throw new DomainError({
          code: 'LIKE_NOT_FOUND',
          status: 404,
          message: 'Like not found',
        });
      }

      if (like.status !== 'paired') {
        throw new DomainError({
          code: 'PAIR_INVITE_REQUIRED',
          status: 409,
          message: 'Pair creation requires completed mutual consent',
        });
      }

      bId = like.fromId === aId ? like.toId : like.fromId;
    }

    if (!aId || !bId) {
      throw new DomainError({
        code: 'PARTNER_OR_LIKE_REQUIRED',
        status: 400,
        message: 'partnerId or likeId is required',
      });
    }

    if (aId === bId) {
      throw new DomainError({
        code: 'PAIR_UNAVAILABLE',
        status: 409,
        message: 'Pair is unavailable',
      });
    }

    const [left, right] = await Promise.all([
      User.findOne({ id: aId }).lean<UserType | null>(),
      User.findOne({ id: bId }).lean<UserType | null>(),
    ]);

    if (!left || !right) {
      throw new DomainError({
        code: 'USER_NOT_FOUND',
        status: 404,
        message: 'Users not found',
      });
    }

    const members = [left.id, right.id].sort() as [string, string];
    const key = `${members[0]}|${members[1]}`;

    const completedOnboardingCount = await MvpOnboardingSession.countDocuments({
      userId: { $in: members },
      status: 'completed',
    });
    if (completedOnboardingCount !== 2) {
      throw new DomainError({
        code: 'PAIR_UNAVAILABLE',
        status: 409,
        message: 'Pair is unavailable',
      });
    }

    const exists = await Pair.findOne({
      status: { $in: ['active', 'paused'] },
      members: { $in: members },
    })
      .lean<{ _id: Types.ObjectId } | null>();

    if (exists) {
      throw new DomainError({
        code: 'PAIR_UNAVAILABLE',
        status: 409,
        message: 'Pair is unavailable',
      });
    }

    const transition = pairTransition(
      null,
      { type: 'CREATE' },
      {
        currentUserId: input.currentUserId,
        role: getPairRole(members, input.currentUserId),
      }
    );

    const pair = await Pair.create({
      members,
      key,
      status: transition.next.status,
      passport: buildPairPassport(left, right),
      fatigue: { score: 0, updatedAt: new Date() },
      readiness: { score: 0, updatedAt: new Date() },
    } as Partial<PairType>);

    await emitEvent({
      event: 'PAIR_CREATED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/pairs/create', method: 'POST' },
      context: {
        pairId: String(pair._id),
      },
      target: {
        type: 'pair',
        id: String(pair._id),
      },
      metadata: {
        pairId: String(pair._id),
        members,
        source: 'manual_create',
      },
    });

    return { pairId: String(pair._id) };
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
