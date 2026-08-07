import { createHash, randomBytes } from 'node:crypto';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { DomainError } from '@/domain/errors';
import { Pair, type PairType } from '@/models/Pair';
import {
  PairInvite,
  type PairInviteStatus,
  type PairInviteType,
} from '@/models/PairInvite';
import {
  PairMembershipClaim,
  type PairMembershipClaimType,
} from '@/models/PairMembershipClaim';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { pairInviteTransition } from '@/domain/state/pairInviteMachine';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';

export const PAIR_INVITE_TOKEN_BYTES = 32;
export const PAIR_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ACTIVE_PAIR_STATUSES: PairType['status'][] = ['active', 'paused'];

type StoredPairInvite = PairInviteType & { _id: Types.ObjectId };
type StoredMembershipClaim = PairMembershipClaimType & { _id: Types.ObjectId };

export type PairInviteOwnerDTO = {
  id: string;
  status: PairInviteStatus;
  expiresAt: string;
  acceptedAt?: string;
  pairId?: string;
  createdAt: string;
  updatedAt: string;
  canCancel: boolean;
  canReissue: boolean;
};

export type PairInviteIssueDTO = {
  invite: PairInviteOwnerDTO;
  token: string;
};

export type PairInviteResolveDTO = {
  state: 'AVAILABLE' | 'ACCEPTED' | 'UNAVAILABLE';
  canAccept: boolean;
  expiresAt?: string;
};

export type PairInviteAcceptDTO = {
  status: 'ACCEPTED';
  pairId: string;
  alreadyAccepted: boolean;
};

type AcceptTransactionResult =
  | {
      kind: 'accepted';
      pairId: string;
      members: [string, string];
      alreadyAccepted: boolean;
    }
  | { kind: 'unavailable' };

export const generatePairInviteToken = (): string =>
  randomBytes(PAIR_INVITE_TOKEN_BYTES).toString('base64url');

export const hashPairInviteToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const unavailable = (): never => {
  throw new DomainError({
    code: 'PAIR_INVITE_UNAVAILABLE',
    status: 409,
    message: 'Pair invite is unavailable',
  });
};

const ownerInviteNotFound = (): never => {
  throw new DomainError({
    code: 'PAIR_INVITE_NOT_FOUND',
    status: 404,
    message: 'Pair invite not found',
  });
};

const ownerHasPair = (): never => {
  throw new DomainError({
    code: 'PAIR_ALREADY_ACTIVE',
    status: 409,
    message: 'An active pair already exists',
  });
};

const activeInviteExists = (): never => {
  throw new DomainError({
    code: 'PAIR_INVITE_ACTIVE',
    status: 409,
    message: 'An active pair invite already exists',
  });
};

const requireCompletedOnboarding = async (userId: string): Promise<void> => {
  const completed = await MvpOnboardingSession.exists({ userId, status: 'completed' });
  if (!completed) {
    throw new DomainError({
      code: 'ONBOARDING_REQUIRED',
      status: 409,
      message: 'Complete personal onboarding before linking a pair',
    });
  }
};

const assertTokenFormat = (token: string): string => {
  const normalized = token.trim();
  if (!TOKEN_PATTERN.test(normalized)) {
    return unavailable();
  }
  return normalized;
};

const isDuplicateKeyError = (error: unknown): error is { code: number } =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: number }).code === 11000;

const pairMembers = (left: string, right: string): [string, string] =>
  [left, right].sort() as [string, string];

const pairKey = (members: [string, string]): string =>
  `${members[0]}|${members[1]}`;

const toOwnerDTO = (invite: StoredPairInvite): PairInviteOwnerDTO => ({
  id: String(invite._id),
  status: invite.status,
  expiresAt: invite.expiresAt.toISOString(),
  ...(invite.acceptedAt ? { acceptedAt: invite.acceptedAt.toISOString() } : {}),
  ...(invite.pairId ? { pairId: String(invite.pairId) } : {}),
  createdAt: invite.createdAt.toISOString(),
  updatedAt: invite.updatedAt.toISOString(),
  canCancel: invite.status === 'ACTIVE',
  canReissue: invite.status !== 'ACCEPTED',
});

const activePairForAnyMember = async (
  userIds: string[],
  session?: ClientSession
): Promise<boolean> => {
  const query = Pair.findOne({
    members: { $in: userIds },
    status: { $in: ACTIVE_PAIR_STATUSES },
  })
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>();
  if (session) query.session(session);
  return Boolean(await query);
};

const expireCreatorInvites = async (
  creatorUserId: string,
  now: Date,
  session?: ClientSession
): Promise<void> => {
  await PairInvite.updateMany(
    {
      creatorUserId,
      status: 'ACTIVE',
      expiresAt: { $lte: now },
    },
    { $set: { status: 'EXPIRED' } },
    session ? { session } : undefined
  );
};

const refreshOwnerInvite = async (input: {
  inviteId: string;
  currentUserId: string;
  now: Date;
}): Promise<StoredPairInvite> => {
  if (!Types.ObjectId.isValid(input.inviteId)) return ownerInviteNotFound();

  let invite = await PairInvite.findOne({
    _id: input.inviteId,
    creatorUserId: input.currentUserId,
  }).lean<StoredPairInvite | null>();
  if (!invite) return ownerInviteNotFound();

  if (invite.status === 'ACTIVE' && invite.expiresAt <= input.now) {
    invite = await PairInvite.findOneAndUpdate(
      {
        _id: invite._id,
        creatorUserId: input.currentUserId,
        status: 'ACTIVE',
        expiresAt: { $lte: input.now },
      },
      { $set: { status: 'EXPIRED' } },
      { new: true }
    ).lean<StoredPairInvite | null>();
    if (!invite) {
      invite = await PairInvite.findOne({
        _id: input.inviteId,
        creatorUserId: input.currentUserId,
      }).lean<StoredPairInvite | null>();
    }
    if (!invite) return ownerInviteNotFound();
  }

  return invite;
};

const releaseEndedMembershipClaims = async (input: {
  members: [string, string];
  session: ClientSession;
}): Promise<void> => {
  const claims = await PairMembershipClaim.find({
    userId: { $in: input.members },
  })
    .session(input.session)
    .lean<StoredMembershipClaim[]>();
  if (claims.length === 0) return;

  const claimedPairIds = [...new Set(claims.map((claim) => String(claim.pairId)))];
  const claimedPairs = await Pair.find({
    _id: { $in: claimedPairIds.map((id) => new Types.ObjectId(id)) },
  })
    .select({ _id: 1, status: 1 })
    .session(input.session)
    .lean<Array<{ _id: Types.ObjectId; status: PairType['status'] }>>();
  const statusByPairId = new Map(
    claimedPairs.map((pair) => [String(pair._id), pair.status])
  );

  for (const claim of claims) {
    if (statusByPairId.get(String(claim.pairId)) !== 'ended') unavailable();
  }

  await PairMembershipClaim.deleteMany(
    { _id: { $in: claims.map((claim) => claim._id) } },
    { session: input.session }
  );
};

const existingAcceptedPairId = async (
  invite: StoredPairInvite,
  currentUserId: string,
  session?: ClientSession
): Promise<string> => {
  if (invite.acceptedByUserId !== currentUserId) unavailable();
  if (invite.pairId) return String(invite.pairId);

  const members = pairMembers(invite.creatorUserId, currentUserId);
  const query = Pair.findOne({ key: pairKey(members) })
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>();
  if (session) query.session(session);
  const pair = await query;
  if (!pair) return unavailable();
  return String(pair._id);
};

const issueInvite = async (input: {
  creatorUserId: string;
  now: Date;
  session?: ClientSession;
}): Promise<{ inviteId: Types.ObjectId; token: string }> => {
  const token = generatePairInviteToken();
  const tokenHash = hashPairInviteToken(token);
  const expiresAt = new Date(input.now.getTime() + PAIR_INVITE_TTL_MS);

  const created = await PairInvite.create(
    [
      {
        creatorUserId: input.creatorUserId,
        tokenHash,
        status: 'ACTIVE',
        expiresAt,
      },
    ],
    input.session ? { session: input.session } : undefined
  );
  const invite = created[0];
  if (!invite) {
    throw new DomainError({
      code: 'INTERNAL',
      status: 500,
      message: 'Pair invite was not created',
    });
  }
  return { inviteId: invite._id as Types.ObjectId, token };
};

export const pairInviteService = {
  async ownerCurrent(input: {
    currentUserId: string;
    now?: Date;
  }): Promise<{ invite: PairInviteOwnerDTO | null }> {
    await connectToDatabase();
    const now = input.now ?? new Date();
    await expireCreatorInvites(input.currentUserId, now);
    const invite = await PairInvite.findOne({
      creatorUserId: input.currentUserId,
    })
      .sort({ createdAt: -1 })
      .lean<StoredPairInvite | null>();
    return { invite: invite ? toOwnerDTO(invite) : null };
  },

  async create(input: {
    currentUserId: string;
    now?: Date;
  }): Promise<PairInviteIssueDTO> {
    await connectToDatabase();
    await requireCompletedOnboarding(input.currentUserId);
    const now = input.now ?? new Date();
    if (await activePairForAnyMember([input.currentUserId])) ownerHasPair();
    await expireCreatorInvites(input.currentUserId, now);

    try {
      const issued = await issueInvite({ creatorUserId: input.currentUserId, now });
      const invite = await PairInvite.findById(issued.inviteId).lean<StoredPairInvite | null>();
      if (!invite) {
        throw new DomainError({
          code: 'INTERNAL',
          status: 500,
          message: 'Pair invite was not found after creation',
        });
      }
      return { invite: toOwnerDTO(invite), token: issued.token };
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) activeInviteExists();
      throw error;
    }
  },

  async ownerStatus(input: {
    currentUserId: string;
    inviteId: string;
    now?: Date;
  }): Promise<PairInviteOwnerDTO> {
    await connectToDatabase();
    const invite = await refreshOwnerInvite({
      inviteId: input.inviteId,
      currentUserId: input.currentUserId,
      now: input.now ?? new Date(),
    });
    return toOwnerDTO(invite);
  },

  async cancel(input: {
    currentUserId: string;
    inviteId: string;
    now?: Date;
  }): Promise<PairInviteOwnerDTO> {
    await connectToDatabase();
    const now = input.now ?? new Date();
    const invite = await refreshOwnerInvite({
      inviteId: input.inviteId,
      currentUserId: input.currentUserId,
      now,
    });
    const transition = pairInviteTransition(
      {
        creatorUserId: invite.creatorUserId,
        status: invite.status,
        acceptedByUserId: invite.acceptedByUserId,
      },
      { type: 'CANCEL' },
      { currentUserId: input.currentUserId, now }
    );
    if (transition.reason === 'INVITE_CANCEL_NOOP') return toOwnerDTO(invite);

    const cancelled = await PairInvite.findOneAndUpdate(
      {
        _id: invite._id,
        creatorUserId: input.currentUserId,
        status: 'ACTIVE',
      },
      { $set: { status: transition.next.status } },
      { new: true }
    ).lean<StoredPairInvite | null>();
    if (!cancelled) {
      const latest = await refreshOwnerInvite({
        inviteId: input.inviteId,
        currentUserId: input.currentUserId,
        now,
      });
      pairInviteTransition(
        {
          creatorUserId: latest.creatorUserId,
          status: latest.status,
          acceptedByUserId: latest.acceptedByUserId,
        },
        { type: 'CANCEL' },
        { currentUserId: input.currentUserId, now }
      );
      return toOwnerDTO(latest);
    }
    return toOwnerDTO(cancelled);
  },

  async reissue(input: {
    currentUserId: string;
    inviteId: string;
    now?: Date;
  }): Promise<PairInviteIssueDTO> {
    await connectToDatabase();
    await requireCompletedOnboarding(input.currentUserId);
    const now = input.now ?? new Date();
    if (await activePairForAnyMember([input.currentUserId])) ownerHasPair();

    const session = await mongoose.startSession();
    let issued: { inviteId: Types.ObjectId; token: string } | undefined;
    try {
      issued = await session.withTransaction(async () => {
        if (await activePairForAnyMember([input.currentUserId], session)) ownerHasPair();
        if (!Types.ObjectId.isValid(input.inviteId)) return ownerInviteNotFound();

        const invite = await PairInvite.findOne({
          _id: input.inviteId,
          creatorUserId: input.currentUserId,
        })
          .session(session)
          .lean<StoredPairInvite | null>();
        if (!invite) return ownerInviteNotFound();

        let currentStatus = invite.status;
        if (currentStatus === 'ACTIVE' && invite.expiresAt <= now) {
          currentStatus = 'EXPIRED';
          await PairInvite.updateOne(
            { _id: invite._id, status: 'ACTIVE' },
            { $set: { status: 'EXPIRED' } },
            { session }
          );
        }
        const transition = pairInviteTransition(
          {
            creatorUserId: invite.creatorUserId,
            status: currentStatus,
            acceptedByUserId: invite.acceptedByUserId,
          },
          { type: 'REISSUE' },
          { currentUserId: input.currentUserId, now }
        );
        if (currentStatus === 'ACTIVE') {
          await PairInvite.updateOne(
            { _id: invite._id, creatorUserId: input.currentUserId, status: 'ACTIVE' },
            { $set: { status: transition.next.status } },
            { session }
          );
        }
        return issueInvite({
          creatorUserId: input.currentUserId,
          now,
          session,
        });
      });
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) activeInviteExists();
      throw error;
    } finally {
      await session.endSession();
    }

    if (!issued) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Pair invite was not reissued',
      });
    }
    const created = await PairInvite.findById(issued.inviteId).lean<StoredPairInvite | null>();
    if (!created) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Reissued pair invite was not found',
      });
    }
    return { invite: toOwnerDTO(created), token: issued.token };
  },

  async resolve(input: {
    currentUserId: string;
    token: string;
    now?: Date;
  }): Promise<PairInviteResolveDTO> {
    await connectToDatabase();
    const token = assertTokenFormat(input.token);
    const tokenHash = hashPairInviteToken(token);
    const now = input.now ?? new Date();
    let invite = await PairInvite.findOne({ tokenHash }).lean<StoredPairInvite | null>();
    if (!invite) return { state: 'UNAVAILABLE', canAccept: false };

    if (invite.status === 'ACTIVE' && invite.expiresAt <= now) {
      invite = await PairInvite.findOneAndUpdate(
        { _id: invite._id, status: 'ACTIVE', expiresAt: { $lte: now } },
        { $set: { status: 'EXPIRED' } },
        { new: true }
      ).lean<StoredPairInvite | null>();
      return { state: 'UNAVAILABLE', canAccept: false };
    }

    if (
      invite.status === 'ACCEPTED' &&
      invite.acceptedByUserId === input.currentUserId
    ) {
      return { state: 'ACCEPTED', canAccept: false };
    }
    if (invite.status !== 'ACTIVE' || invite.creatorUserId === input.currentUserId) {
      return { state: 'UNAVAILABLE', canAccept: false };
    }
    return {
      state: 'AVAILABLE',
      canAccept: true,
      expiresAt: invite.expiresAt.toISOString(),
    };
  },

  async accept(input: {
    currentUserId: string;
    token: string;
    auditRequest?: AuditRequestContext;
    now?: Date;
  }): Promise<PairInviteAcceptDTO> {
    await connectToDatabase();
    await requireCompletedOnboarding(input.currentUserId);
    const token = assertTokenFormat(input.token);
    const tokenHash = hashPairInviteToken(token);
    const now = input.now ?? new Date();
    const initial = await PairInvite.findOne({ tokenHash }).lean<StoredPairInvite | null>();
    if (!initial) return unavailable();

    if (initial.status === 'ACTIVE' && initial.expiresAt <= now) {
      await PairInvite.updateOne(
        { _id: initial._id, status: 'ACTIVE', expiresAt: { $lte: now } },
        { $set: { status: 'EXPIRED' } }
      );
      return unavailable();
    }

    const initialTransition = pairInviteTransition(
      {
        creatorUserId: initial.creatorUserId,
        status: initial.status,
        acceptedByUserId: initial.acceptedByUserId,
      },
      { type: 'ACCEPT' },
      { currentUserId: input.currentUserId, now }
    );
    if (initialTransition.reason === 'INVITE_ACCEPT_NOOP') {
      return {
        status: 'ACCEPTED',
        pairId: await existingAcceptedPairId(initial, input.currentUserId),
        alreadyAccepted: true,
      };
    }

    const members = pairMembers(initial.creatorUserId, input.currentUserId);
    if (await activePairForAnyMember(members)) unavailable();

    const session = await mongoose.startSession();
    let result: AcceptTransactionResult | undefined;
    try {
      result = await session.withTransaction(
        async (): Promise<AcceptTransactionResult> => {
          const invite = await PairInvite.findById(initial._id)
            .session(session)
            .lean<StoredPairInvite | null>();
          if (!invite) return { kind: 'unavailable' };

          if (invite.status === 'ACTIVE' && invite.expiresAt <= now) {
            await PairInvite.updateOne(
              { _id: invite._id, status: 'ACTIVE', expiresAt: { $lte: now } },
              { $set: { status: 'EXPIRED' } },
              { session }
            );
            return { kind: 'unavailable' };
          }

          const transition = pairInviteTransition(
            {
              creatorUserId: invite.creatorUserId,
              status: invite.status,
              acceptedByUserId: invite.acceptedByUserId,
            },
            { type: 'ACCEPT' },
            { currentUserId: input.currentUserId, now }
          );
          const liveMembers = pairMembers(invite.creatorUserId, input.currentUserId);
          if (transition.reason === 'INVITE_ACCEPT_NOOP') {
            return {
              kind: 'accepted',
              pairId: await existingAcceptedPairId(invite, input.currentUserId, session),
              members: liveMembers,
              alreadyAccepted: true,
            };
          }

          if (await activePairForAnyMember(liveMembers, session)) unavailable();
          await releaseEndedMembershipClaims({ members: liveMembers, session });

          const key = pairKey(liveMembers);
          const existingPair = await Pair.findOne({ key })
            .session(session)
            .lean<(PairType & { _id: Types.ObjectId }) | null>();
          const targetPairId = existingPair?._id ?? new Types.ObjectId();

          await PairMembershipClaim.insertMany(
            liveMembers.map((userId) => ({
              userId,
              pairId: targetPairId,
              inviteId: invite._id,
              pairKey: key,
            })),
            { session }
          );

          if (existingPair) {
            if (existingPair.status !== 'ended') unavailable();
            const activated = await Pair.findOneAndUpdate(
              { _id: existingPair._id, status: 'ended' },
              { $set: { status: 'active' } },
              { new: true, session }
            ).lean<(PairType & { _id: Types.ObjectId }) | null>();
            if (!activated) unavailable();
          } else {
            await Pair.create(
              [
                {
                  _id: targetPairId,
                  members: liveMembers,
                  key,
                  status: 'active',
                  fatigue: { score: 0, updatedAt: now },
                  readiness: { score: 0, updatedAt: now },
                },
              ],
              { session }
            );
          }

          const accepted = await PairInvite.findOneAndUpdate(
            {
              _id: invite._id,
              status: 'ACTIVE',
              expiresAt: { $gt: now },
            },
            {
              $set: {
                status: transition.next.status,
                acceptedByUserId: input.currentUserId,
                acceptedAt: transition.next.acceptedAt ?? now,
                pairId: targetPairId,
              },
            },
            { new: true, session }
          ).lean<StoredPairInvite | null>();
          if (!accepted) unavailable();

          return {
            kind: 'accepted',
            pairId: String(targetPairId),
            members: liveMembers,
            alreadyAccepted: false,
          };
        }
      );
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) unavailable();
      throw error;
    } finally {
      await session.endSession();
    }

    if (!result) return unavailable();
    if (result.kind === 'unavailable') return unavailable();
    if (!result.alreadyAccepted) {
      await emitEvent({
        event: 'PAIR_CREATED',
        actor: { userId: input.currentUserId },
        request: input.auditRequest ?? {
          route: '/api/pair-invites/accept',
          method: 'POST',
        },
        context: { pairId: result.pairId },
        target: { type: 'pair', id: result.pairId },
        metadata: {
          pairId: result.pairId,
          members: result.members,
          source: 'pair_invite_accept',
        },
      });
    }

    return {
      status: 'ACCEPTED',
      pairId: result.pairId,
      alreadyAccepted: result.alreadyAccepted,
    };
  },
};
