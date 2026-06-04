import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import type { Axis } from '@/models/ActivityTemplate';
import { User, type UserType } from '@/models/User';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { matchTransition } from '@/domain/state/matchMachine';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { activityOfferService } from '@/domain/services/activityOffer.service';
import { distance, score } from '@/utils/calcMatch';
import { buildPairPassport } from '@/domain/services/pairDiagnostics.service';
import { readAxisLayer } from '@/domain/services/vectorScoring.service';

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

const ensureLikeParticipant = async (
  likeId: string,
  currentUserId: string
): Promise<{ like: { _id: Types.ObjectId } & LikeType; role: 'from' | 'to' }> => {
  const likeGuard = await requireLikeParticipant(likeId, currentUserId);
  if (!likeGuard.ok) {
    throw await guardFailureToDomainError(likeGuard.response);
  }
  return likeGuard.data;
};

const sanitize = (value: string | null | undefined, maxLength: number): string =>
  String(value ?? '').trim().slice(0, maxLength);

const buildInitiatorSnapshot = (
  user: UserType | null
): LikeType['fromCardSnapshot'] | undefined => {
  const card = user?.profile?.matchCard;
  if (!card?.isActive) return undefined;
  if (!card.requirements?.length || !card.questions?.length) return undefined;

  return {
    requirements: [
      sanitize(card.requirements[0], 80),
      sanitize(card.requirements[1], 80),
      sanitize(card.requirements[2], 80),
    ],
    questions: [
      sanitize(card.questions[0], 120),
      sanitize(card.questions[1], 120),
    ],
    updatedAt: card.updatedAt,
  };
};

const AXES: readonly Axis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
] as const;

type AxisVector = {
  level: number;
  positives: string[];
  negatives: string[];
};

const getAxisVector = (user: UserType, axis: Axis): AxisVector => {
  const vector = readAxisLayer(user, axis, 'trait');
  return {
    level: vector.level,
    positives: vector.positives,
    negatives: vector.negatives,
  };
};

const toVectorLevels = (user: UserType): number[] =>
  AXES.map((axis) => getAxisVector(user, axis).level);

const hasUsableVectors = (user: UserType): boolean =>
  AXES.some((axis) => {
    const vector = getAxisVector(user, axis);
    return vector.level !== 0 || vector.positives.length > 0 || vector.negatives.length > 0;
  });

const calculateMatchScore = (left: UserType, right: UserType): number => {
  if (!hasUsableVectors(left) || !hasUsableVectors(right)) return 0;
  return score(distance(toVectorLevels(left), toVectorLevels(right)));
};

const seedSuggestionsForPair = async (
  pairId: Types.ObjectId,
  currentUserId: string
): Promise<void> => {
  const hasOffered = await PairActivity.exists({ pairId, status: 'offered' });
  if (hasOffered) return;

  await activityOfferService.suggestActivities({
    pairId: String(pairId),
    currentUserId,
    dedupeAgainstLastOffered: true,
    source: 'pairs.activities.suggest',
  });
};

const stateConflict = (details: Record<string, string>): never => {
  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message: 'Unable to apply like transition',
    details,
  });
};

export type CreateLikeInput = {
  currentUserId: string;
  toId: string;
  agreements: [true, true, true];
  answers: [string, string];
  auditRequest?: AuditRequestContext;
};

export type RespondToLikeInput = {
  currentUserId: string;
  likeId: string;
  agreements: [true, true, true];
  answers: [string, string];
  auditRequest?: AuditRequestContext;
};

export type DecideLikeInput = {
  currentUserId: string;
  likeId: string;
  auditRequest?: AuditRequestContext;
};

export const matchService = {
  async createLike(input: CreateLikeInput): Promise<{ id: string; matchScore: number }> {
    await connectToDatabase();

    const transition = matchTransition(
      {
        fromId: input.currentUserId,
        toId: input.toId,
        status: 'draft',
      },
      { type: 'CREATE' },
      {
        currentUserId: input.currentUserId,
        role: 'from',
      }
    );

    const [initiator, recipient] = await Promise.all([
      User.findOne({ id: input.currentUserId }).lean<UserType | null>(),
      User.findOne({ id: input.toId }).lean<UserType | null>(),
    ]);

    if (!initiator || !recipient) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Like users are missing',
      });
    }

    const fromCardSnapshot = buildInitiatorSnapshot(initiator);

    if (!fromCardSnapshot) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Initiator card snapshot is missing',
        details: {
          reason: 'initiator_card_snapshot_missing',
        },
      });
    }

    const matchScore = calculateMatchScore(initiator, recipient);
    const like = await Like.create({
      fromId: input.currentUserId,
      toId: input.toId,
      matchScore,
      fromCardSnapshot,
      agreements: input.agreements,
      answers: [
        sanitize(input.answers[0], 280),
        sanitize(input.answers[1], 280),
      ],
      cardSnapshot: fromCardSnapshot,
      status: transition.next.status,
    });

    await emitEvent({
      event: 'MATCH_LIKE_CREATED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/match/like', method: 'POST' },
      context: {
        likeId: String(like._id),
      },
      target: {
        type: 'like',
        id: String(like._id),
      },
      metadata: {
        likeId: String(like._id),
        toUserId: input.toId,
        matchScore,
      },
    });

    return {
      id: String(like._id),
      matchScore,
    };
  },

  async respondToLike(input: RespondToLikeInput): Promise<{ status: LikeType['status'] }> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const initiator = await User.findOne({ id: like.fromId }).lean<UserType | null>();
    const initiatorCardSnapshot =
      buildInitiatorSnapshot(initiator) ?? like.fromCardSnapshot;

    if (!initiatorCardSnapshot) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Initiator card snapshot is missing',
        details: {
          reason: 'initiator_card_snapshot_missing',
        },
      });
    }

    const now = new Date();
    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientResponse: like.recipientResponse,
      },
      {
        type: 'RESPOND',
        response: {
          agreements: [true, true, true],
          answers: [
            sanitize(input.answers[0], 280),
            sanitize(input.answers[1], 280),
          ],
          initiatorCardSnapshot,
          at: now,
        },
      },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    const updated = await Like.findOneAndUpdate(
      {
        _id: like._id,
        toId: input.currentUserId,
        status: { $in: ['sent', 'viewed'] },
      },
      {
        $set: {
          recipientResponse: transition.next.recipientResponse,
          status: transition.next.status,
          updatedAt: transition.next.updatedAt,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) {
      return stateConflict({
        likeId: input.likeId,
        action: 'RESPOND',
      });
    }

    await emitEvent({
      event: 'MATCH_RESPONDED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/match/respond', method: 'POST' },
      context: {
        likeId: String(updated._id),
      },
      target: {
        type: 'like',
        id: String(updated._id),
      },
      metadata: {
        likeId: String(updated._id),
        status: 'awaiting_initiator',
      },
    });

    return { status: updated.status };
  },

  async acceptLike(input: DecideLikeInput): Promise<Record<string, never>> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const now = new Date();
    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientResponse: like.recipientResponse,
      },
      { type: 'ACCEPT', at: now },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    const updated = await Like.findOneAndUpdate(
      {
        _id: like._id,
        fromId: input.currentUserId,
        status: 'awaiting_initiator',
      },
      {
        $set: {
          initiatorDecision: transition.next.initiatorDecision,
          status: transition.next.status,
          updatedAt: transition.next.updatedAt,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) {
      return stateConflict({
        likeId: input.likeId,
        action: 'ACCEPT',
      });
    }

    await emitEvent({
      event: 'MATCH_ACCEPTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/match/accept', method: 'POST' },
      context: {
        likeId: String(updated._id),
      },
      target: {
        type: 'like',
        id: String(updated._id),
      },
      metadata: {
        likeId: String(updated._id),
        status: 'mutual_ready',
      },
    });

    return {};
  },

  async rejectLike(input: DecideLikeInput): Promise<{ already?: true }> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const now = new Date();
    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientDecision: like.recipientDecision,
      },
      { type: 'REJECT', at: now },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    if (like.status === 'rejected') {
      await emitEvent({
        event: 'MATCH_REJECTED',
        actor: { userId: input.currentUserId },
        request: input.auditRequest ?? { route: '/api/match/reject', method: 'POST' },
        context: {
          likeId: String(like._id),
        },
        target: {
          type: 'like',
          id: String(like._id),
        },
        metadata: {
          likeId: String(like._id),
          status: 'rejected',
          already: true,
        },
      });
      return { already: true };
    }

    const updated = await Like.findOneAndUpdate(
      {
        _id: like._id,
        toId: input.currentUserId,
        status: { $in: ['sent', 'viewed'] },
      },
      {
        $set: {
          recipientDecision: transition.next.recipientDecision,
          status: transition.next.status,
          updatedAt: transition.next.updatedAt,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) {
      return stateConflict({
        likeId: input.likeId,
        action: 'REJECT',
      });
    }

    await emitEvent({
      event: 'MATCH_REJECTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/match/reject', method: 'POST' },
      context: {
        likeId: String(updated._id),
      },
      target: {
        type: 'like',
        id: String(updated._id),
      },
      metadata: {
        likeId: String(updated._id),
        status: 'rejected',
      },
    });

    return {};
  },

  async confirmLike(input: DecideLikeInput): Promise<{ pairId: string; members: [string, string] }> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientResponse: like.recipientResponse,
      },
      { type: 'CONFIRM' },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    const [fromUser, toUser] = await Promise.all([
      User.findOne({ id: like.fromId }).lean<UserType | null>(),
      User.findOne({ id: like.toId }).lean<UserType | null>(),
    ]);

    if (!fromUser || !toUser) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Pair users are missing',
      });
    }

    const confirmedLike = await Like.findOneAndUpdate(
      {
        _id: like._id,
        fromId: input.currentUserId,
        status: 'mutual_ready',
      },
      {
        $set: {
          status: transition.next.status,
          updatedAt: transition.next.updatedAt ?? new Date(),
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!confirmedLike) {
      return stateConflict({
        likeId: input.likeId,
        action: 'CONFIRM',
      });
    }

    const members = [fromUser.id, toUser.id].sort() as [string, string];
    const key = `${members[0]}|${members[1]}`;
    const existingPair = await Pair.findOne({ key }, { _id: 1 }).lean<{ _id: Types.ObjectId } | null>();

    // Safe ordering prevents Pair activation before the Like transition. Without a
    // MongoDB transaction, later side effects can still fail after the Like is paired.
    const pair = await Pair.findOneAndUpdate(
      { key },
      {
        $setOnInsert: {
          key,
          members,
          progress: { streak: 0, completed: 0 },
        },
        $set: { status: 'active' },
      },
      { new: true, upsert: true }
    );

    const requiresPassport =
      !pair.passport ||
      !Array.isArray(pair.passport.riskZones) ||
      pair.passport.riskZones.length === 0;

    if (requiresPassport) {
      pair.passport = buildPairPassport(fromUser, toUser);
      await pair.save();
    }

    await Like.updateMany(
      {
        _id: { $ne: like._id },
        $or: [
          { fromId: like.fromId, toId: like.toId },
          { fromId: like.toId, toId: like.fromId },
        ],
        status: {
          $in: ['sent', 'viewed', 'awaiting_initiator', 'mutual_ready'],
        },
      },
      { $set: { status: 'expired' } }
    );

    await User.updateMany(
      { id: { $in: members } },
      { $set: { 'personal.relationshipStatus': 'in_relationship' } }
    );

    await seedSuggestionsForPair(pair._id as Types.ObjectId, input.currentUserId);

    await emitEvent({
      event: 'MATCH_CONFIRMED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/match/confirm', method: 'POST' },
      context: {
        likeId: String(like._id),
        pairId: String(pair._id),
      },
      target: {
        type: 'pair',
        id: String(pair._id),
      },
      metadata: {
        likeId: String(like._id),
        pairId: String(pair._id),
        members,
      },
    });

    if (!existingPair) {
      await emitEvent({
        event: 'PAIR_CREATED',
        actor: { userId: input.currentUserId },
        request: input.auditRequest ?? { route: '/api/match/confirm', method: 'POST' },
        context: {
          pairId: String(pair._id),
          likeId: String(like._id),
        },
        target: {
          type: 'pair',
          id: String(pair._id),
        },
        metadata: {
          pairId: String(pair._id),
          members,
          source: 'match_confirm',
        },
      });
    }

    return {
      pairId: String(pair._id),
      members,
    };
  },
};

