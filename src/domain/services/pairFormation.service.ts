import { Types, type ClientSession } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { notificationService } from '@/domain/services/notification.service';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { CandidateDiscoveryProjection } from '@/models/CandidateDiscoveryProjection';
import { CandidatePresentationGrant } from '@/models/CandidatePresentationGrant';
import { Like } from '@/models/Like';
import { MatchingConnection } from '@/models/MatchingConnection';
import { MatchingFeedSession } from '@/models/MatchingFeedSession';
import { MatchingProfile } from '@/models/MatchingProfile';
import { Pair, type PairType } from '@/models/Pair';
import { PairInvite } from '@/models/PairInvite';
import {
  PairMembershipClaim,
  type PairMembershipClaimType,
} from '@/models/PairMembershipClaim';
import { User } from '@/models/User';

export type PairFormationSource = 'PAIR_INVITE' | 'MATCHING_CONNECTION';
export type PairFormationMembers = [string, string];

type StoredMembershipClaim = PairMembershipClaimType & { _id: Types.ObjectId };
const ACTIVE_PAIR_STATUSES: PairType['status'][] = ['active', 'paused'];

export const canonicalPairMembers = (
  left: string,
  right: string,
): PairFormationMembers => {
  const normalized = [left.trim(), right.trim()].sort() as PairFormationMembers;
  if (!normalized[0] || !normalized[1] || normalized[0] === normalized[1]) {
    throw new DomainError({
      code: 'PAIR_MEMBERS_INVALID',
      status: 409,
      message: 'Pair members must be two different users',
    });
  }
  return normalized;
};

export const canonicalPairKey = (members: PairFormationMembers): string =>
  `${members[0]}|${members[1]}`;

export const activePairForAnyMember = async (
  userIds: readonly string[],
  session?: ClientSession,
): Promise<boolean> => {
  const query = Pair.findOne({
    members: { $in: [...userIds] },
    status: { $in: ACTIVE_PAIR_STATUSES },
  })
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>();
  if (session) query.session(session);
  return Boolean(await query);
};

export const fencePairMembershipSlots = async (
  userIds: readonly string[],
  session: ClientSession,
): Promise<void> => {
  const uniqueUserIds = [...new Set(userIds)];
  const result = await User.updateMany(
    { id: { $in: uniqueUserIds } },
    { $inc: { pairMembershipRevision: 1 } },
    { session },
  );
  if (result.matchedCount !== uniqueUserIds.length) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Pair member was not found',
    });
  }
};

const releaseEndedMembershipClaims = async (input: {
  members: PairFormationMembers;
  session: ClientSession;
}): Promise<void> => {
  const claims = await PairMembershipClaim.find({
    userId: { $in: input.members },
  })
    .session(input.session)
    .lean<StoredMembershipClaim[]>();
  if (claims.length === 0) return;

  const claimedPairIds = [
    ...new Set(claims.map((claim) => String(claim.pairId))),
  ];
  const claimedPairs = await Pair.find({
    _id: { $in: claimedPairIds.map((id) => new Types.ObjectId(id)) },
  })
    .select({ _id: 1, status: 1 })
    .session(input.session)
    .lean<Array<{ _id: Types.ObjectId; status: PairType['status'] }>>();
  const statusByPairId = new Map(
    claimedPairs.map((pair) => [String(pair._id), pair.status]),
  );
  if (
    claims.some((claim) => statusByPairId.get(String(claim.pairId)) !== 'ended')
  ) {
    throw new DomainError({
      code: 'PAIR_ALREADY_ACTIVE',
      status: 409,
      message: 'An active pair already exists',
    });
  }
  await PairMembershipClaim.deleteMany(
    { _id: { $in: claims.map((claim) => claim._id) } },
    { session: input.session },
  );
};

const requireCompletedOnboarding = async (
  members: PairFormationMembers,
  session: ClientSession,
): Promise<void> => {
  const completedMemberIds = await MvpOnboardingSession.distinct('userId', {
    userId: { $in: members },
    status: 'completed',
  }).session(session);
  if (
    completedMemberIds.length !== members.length ||
    members.some((member) => !completedMemberIds.includes(member))
  ) {
    throw new DomainError({
      code: 'ONBOARDING_REQUIRED',
      status: 409,
      message: 'Both members must complete onboarding before forming a pair',
    });
  }
};

const existingSourcePair = async (input: {
  source: PairFormationSource;
  sourceId: string;
  members: PairFormationMembers;
  session: ClientSession;
}): Promise<string | null> => {
  const claims = await PairMembershipClaim.find({
    source: input.source,
    sourceId: input.sourceId,
  })
    .session(input.session)
    .lean<StoredMembershipClaim[]>();
  if (claims.length === 0) return null;
  const claimedUsers = claims.map((claim) => claim.userId).sort();
  const pairIds = [...new Set(claims.map((claim) => String(claim.pairId)))];
  if (
    claimedUsers.length !== 2 ||
    claimedUsers[0] !== input.members[0] ||
    claimedUsers[1] !== input.members[1] ||
    pairIds.length !== 1
  ) {
    throw new DomainError({
      code: 'PAIR_FORMATION_SOURCE_CONFLICT',
      status: 409,
      message: 'Pair formation source conflicts with existing membership',
    });
  }
  const pair = await Pair.findOne({
    _id: pairIds[0],
    members: input.members,
    status: { $in: ACTIVE_PAIR_STATUSES },
  })
    .select({ _id: 1 })
    .session(input.session)
    .lean<{ _id: Types.ObjectId } | null>();
  if (!pair) {
    throw new DomainError({
      code: 'PAIR_FORMATION_SOURCE_CONFLICT',
      status: 409,
      message: 'Pair formation source references an unavailable pair',
    });
  }
  return String(pair._id);
};

const closeConflictingMatchingState = async (input: {
  source: PairFormationSource;
  sourceId: string;
  members: PairFormationMembers;
  now: Date;
  session: ClientSession;
}): Promise<void> => {
  const sourceConnection =
    input.source === 'MATCHING_CONNECTION' &&
    Types.ObjectId.isValid(input.sourceId)
      ? await MatchingConnection.findOne({
          _id: new Types.ObjectId(input.sourceId),
          participantIds: { $all: input.members },
          status: 'ACTIVE',
          stage: 'COUPLE_CONFIRMED',
          pairId: { $exists: false },
          'coupleConfirmation.confirmedBy': { $all: input.members },
        })
          .select({
            _id: 1,
            participantIds: 1,
            sourceLikeIds: 1,
            coupleConfirmation: 1,
          })
          .session(input.session)
          .lean<{
            _id: Types.ObjectId;
            participantIds: [string, string];
            sourceLikeIds: string[];
            coupleConfirmation: { confirmedBy: string[] };
          } | null>()
      : null;
  if (input.source === 'MATCHING_CONNECTION' && !sourceConnection) {
    throw new DomainError({
      code: 'MATCHING_CONNECTION_UNAVAILABLE',
      status: 409,
      message: 'Matching connection is unavailable for Pair formation',
    });
  }
  if (
    sourceConnection &&
    (sourceConnection.coupleConfirmation.confirmedBy.length !== 2 ||
      sourceConnection.coupleConfirmation.confirmedBy.some(
        (userId) => !input.members.includes(userId),
      ))
  ) {
    throw new DomainError({
      code: 'MATCHING_CONFIRMATION_INCOMPLETE',
      status: 409,
      message: 'Both matching participants must confirm Pair formation',
    });
  }
  const preservedLikeIds = (sourceConnection?.sourceLikeIds ?? [])
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  await Like.updateMany(
    {
      $or: [
        { fromId: { $in: input.members } },
        { toId: { $in: input.members } },
      ],
      status: { $in: ['SENT', 'VIEWED', 'RESPONDED', 'MATCHED'] },
      ...(preservedLikeIds.length ? { _id: { $nin: preservedLikeIds } } : {}),
    },
    {
      $set: { status: 'EXPIRED', updatedAt: input.now },
      $inc: { revision: 1 },
    },
    { session: input.session },
  );
  await MatchingConnection.updateMany(
    {
      participantIds: { $in: input.members },
      status: { $in: ['ACTIVE', 'PAUSED'] },
      ...(sourceConnection ? { _id: { $ne: sourceConnection._id } } : {}),
    },
    {
      $set: { status: 'CLOSED', updatedAt: input.now },
      $inc: { revision: 1 },
    },
    { session: input.session },
  );
  // MongoDB does not support parallel operations on one transaction session.
  // These remain bounded bulk writes, but must be dispatched serially.
  await MatchingProfile.updateMany(
    { userId: { $in: input.members } },
    { $set: { active: false, discoveryRequested: false } },
    { session: input.session },
  );
  await CandidateDiscoveryProjection.updateMany(
    { userId: { $in: input.members } },
    { $set: { active: false } },
    { session: input.session },
  );
  await CandidatePresentationGrant.updateMany(
    {
      $or: [
        { requesterId: { $in: input.members } },
        { candidateId: { $in: input.members } },
      ],
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: input.now } },
    { session: input.session },
  );
  await MatchingFeedSession.deleteMany(
    { requesterId: { $in: input.members } },
    { session: input.session },
  );
  await PairInvite.updateMany(
    {
      creatorUserId: { $in: input.members },
      status: 'ACTIVE',
      ...(input.source === 'PAIR_INVITE' &&
      Types.ObjectId.isValid(input.sourceId)
        ? { _id: { $ne: new Types.ObjectId(input.sourceId) } }
        : {}),
    },
    { $set: { status: 'CANCELLED' } },
    { session: input.session },
  );
  await User.updateMany(
    { id: { $in: input.members } },
    { $set: { 'personal.relationshipStatus': 'in_relationship' } },
    { session: input.session },
  );
};

/**
 * Source-agnostic invariant core. The caller owns the surrounding transaction
 * so source state and Pair linkage commit atomically.
 */
export async function formPairInSession(input: {
  source: PairFormationSource;
  sourceId: string;
  members: PairFormationMembers;
  now: Date;
  session: ClientSession;
}): Promise<{
  pairId: string;
  members: PairFormationMembers;
  alreadyFormed: boolean;
}> {
  const members = canonicalPairMembers(input.members[0], input.members[1]);
  const sourceId = input.sourceId.trim();
  if (!sourceId) {
    throw new DomainError({
      code: 'PAIR_FORMATION_SOURCE_INVALID',
      status: 409,
      message: 'Pair formation source is invalid',
    });
  }

  const existingPairId = await existingSourcePair({
    source: input.source,
    sourceId,
    members,
    session: input.session,
  });
  if (existingPairId) {
    return { pairId: existingPairId, members, alreadyFormed: true };
  }

  await fencePairMembershipSlots(members, input.session);
  if (await activePairForAnyMember(members, input.session)) {
    throw new DomainError({
      code: 'PAIR_ALREADY_ACTIVE',
      status: 409,
      message: 'An active pair already exists',
    });
  }
  await requireCompletedOnboarding(members, input.session);
  await releaseEndedMembershipClaims({ members, session: input.session });

  const pairId = new Types.ObjectId();
  const pairKey = canonicalPairKey(members);
  const inviteId =
    input.source === 'PAIR_INVITE' && Types.ObjectId.isValid(sourceId)
      ? new Types.ObjectId(sourceId)
      : undefined;

  await PairMembershipClaim.insertMany(
    members.map((userId) => ({
      userId,
      pairId,
      ...(inviteId ? { inviteId } : {}),
      source: input.source,
      sourceId,
      pairKey,
    })),
    { session: input.session },
  );
  await Pair.create(
    [
      {
        _id: pairId,
        members,
        key: pairKey,
        status: 'active',
        contextVersion: 'pair-context-v1',
        progress: { streak: 0, completed: 0 },
      },
    ],
    { session: input.session },
  );
  const { materializeMeasuredPairProfile } = await import('./measuredPairProfile.service');
  await materializeMeasuredPairProfile(String(pairId), input.session);
  await closeConflictingMatchingState({
    source: input.source,
    sourceId,
    members,
    now: input.now,
    session: input.session,
  });
  await notificationService.create({
    userIds: members,
    pairId: String(pairId),
    type: 'PAIR_JOINED',
    sourceKey: `${input.source.toLowerCase()}:${sourceId}`,
    now: input.now,
    session: input.session,
  });
  return {
    pairId: String(pairId),
    members,
    alreadyFormed: false,
  };
}
