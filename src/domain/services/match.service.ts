import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType } from '@/models/Like';
import { User, type UserType } from '@/models/User';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { matchTransition } from '@/domain/state/matchMachine';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import {
  LEGACY_MATCH_SCORE_AVAILABLE,
  LEGACY_MATCH_SCORE_SENTINEL,
} from '@/domain/matchScorePolicy';

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

type LikeCreationIdentity = {
  keyHash: string;
  requestHash: string;
};

type LikeCreationRecord = Pick<LikeType, '_id' | 'creationRequestHash'>;

type DuplicateKeyError = Error & {
  code: number;
};

const isDuplicateKeyError = (error: Error): error is DuplicateKeyError =>
  'code' in error && (error as { code?: number }).code === 11000;

const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const deriveLikeCreationIdentity = (
  input: CreateLikeInput
): LikeCreationIdentity => ({
  keyHash: sha256(
    JSON.stringify([
      'match-like-create-key-v1',
      input.currentUserId,
      input.idempotencyKey,
    ])
  ),
  requestHash: sha256(
    JSON.stringify({
      version: 'match-like-create-request-v1',
      currentUserId: input.currentUserId,
      toId: input.toId,
      agreements: input.agreements,
      answers: input.answers,
    })
  ),
});

const findLikeByCreationKey = async (input: {
  currentUserId: string;
  keyHash: string;
}): Promise<LikeCreationRecord | null> =>
  Like.findOne({
    fromId: input.currentUserId,
    creationKeyHash: input.keyHash,
  })
    .select({ _id: 1, creationRequestHash: 1 })
    .lean<LikeCreationRecord | null>();

const toCreateLikeResult = (likeId: Types.ObjectId) => ({
  id: String(likeId),
  matchScore: LEGACY_MATCH_SCORE_SENTINEL,
  matchScoreAvailable: LEGACY_MATCH_SCORE_AVAILABLE,
});

const resolveLikeCreationReplay = (
  record: LikeCreationRecord,
  requestHash: string
) => {
  if (record.creationRequestHash !== requestHash) {
    throw new DomainError({
      code: 'IDEMPOTENCY_KEY_REUSE_CONFLICT',
      status: 409,
      message: 'Idempotency-Key was already used with a different request',
    });
  }

  return toCreateLikeResult(record._id);
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
  idempotencyKey: string;
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
  async createLike(input: CreateLikeInput): Promise<{
    id: string;
    matchScore: typeof LEGACY_MATCH_SCORE_SENTINEL;
    matchScoreAvailable: typeof LEGACY_MATCH_SCORE_AVAILABLE;
  }> {
    await connectToDatabase();

    const creationIdentity = deriveLikeCreationIdentity(input);
    const existing = await findLikeByCreationKey({
      currentUserId: input.currentUserId,
      keyHash: creationIdentity.keyHash,
    });
    if (existing) {
      return resolveLikeCreationReplay(existing, creationIdentity.requestHash);
    }

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

    const [initiator, recipientExists] = await Promise.all([
      User.findOne({ id: input.currentUserId }).lean<UserType | null>(),
      User.exists({ id: input.toId }),
    ]);

    if (!initiator || !recipientExists) {
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

    try {
      const like = await Like.create({
        fromId: input.currentUserId,
        toId: input.toId,
        matchScore: LEGACY_MATCH_SCORE_SENTINEL,
        creationKeyHash: creationIdentity.keyHash,
        creationRequestHash: creationIdentity.requestHash,
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
        },
      });

      return toCreateLikeResult(like._id);
    } catch (error) {
      if (!(error instanceof Error) || !isDuplicateKeyError(error)) {
        throw error;
      }

      const raced = await findLikeByCreationKey({
        currentUserId: input.currentUserId,
        keyHash: creationIdentity.keyHash,
      });
      if (!raced) throw error;
      return resolveLikeCreationReplay(raced, creationIdentity.requestHash);
    }
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
    await ensureLikeParticipant(input.likeId, input.currentUserId);
    throw new DomainError({
      code: 'PAIR_INVITE_REQUIRED',
      status: 409,
      message: 'Use a consensual pair invitation',
    });
  },
};

