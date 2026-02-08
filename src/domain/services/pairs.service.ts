import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { Pair, type PairType } from '@/models/Pair';
import { Like, type LikeType } from '@/models/Like';
import type { Axis } from '@/models/ActivityTemplate';
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

const AXES: readonly Axis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
] as const;

const HIGH = 2.0;
const LOW = 0.75;
const DELTA = 2.0;

const intersect = (left: string[] = [], right: string[] = []): string[] =>
  left.filter((item) => right.includes(item));

const buildPassport = (left: UserType, right: UserType): NonNullable<PairType['passport']> => {
  const strongSides: { axis: Axis; facets: string[] }[] = [];
  const riskZones: { axis: Axis; facets: string[]; severity: 1 | 2 | 3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta: { axis: Axis; delta: number }[] = [];

  for (const axis of AXES) {
    const leftVector = left.vectors[axis];
    const rightVector = right.vectors[axis];

    const bothHigh = leftVector.level >= HIGH && rightVector.level >= HIGH;
    const bothLow = leftVector.level <= LOW && rightVector.level <= LOW;
    const delta = Math.abs(leftVector.level - rightVector.level);

    const positives = intersect(leftVector.positives, rightVector.positives);
    const negatives = intersect(leftVector.negatives, rightVector.negatives);
    const leftCoversRight = intersect(leftVector.positives, rightVector.negatives);
    const rightCoversLeft = intersect(rightVector.positives, leftVector.negatives);

    if (positives.length > 0 || bothHigh) {
      strongSides.push({ axis, facets: positives });
    }

    if (negatives.length > 0 || bothLow || delta > DELTA) {
      const severity: 1 | 2 | 3 =
        delta > DELTA + 1 ? 3 : bothLow || negatives.length >= 2 ? 2 : 1;
      riskZones.push({
        axis,
        facets: negatives.length > 0 ? negatives : [],
        severity,
      });
    }

    if (leftCoversRight.length > 0 || rightCoversLeft.length > 0) {
      complementMap.push({
        axis,
        A_covers_B: leftCoversRight,
        B_covers_A: rightCoversLeft,
      });
    }

    if (delta > 0.01) {
      levelDelta.push({ axis, delta });
    }
  }

  return { strongSides, riskZones, complementMap, levelDelta };
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
    let bId = input.partnerId?.trim() ?? '';

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

      bId = like.fromId === aId ? like.toId : like.fromId;
    }

    if (!aId || !bId) {
      throw new DomainError({
        code: 'PARTNER_OR_LIKE_REQUIRED',
        status: 400,
        message: 'partnerId or likeId is required',
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

    const exists = await Pair.findOne({ key, status: { $in: ['active', 'paused'] } })
      .lean<{ _id: Types.ObjectId } | null>();

    if (exists) {
      throw new DomainError({
        code: 'PAIR_ALREADY_EXISTS',
        status: 409,
        message: 'Pair already exists',
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
      passport: buildPassport(left, right),
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
