import { createHash, randomBytes } from 'node:crypto';
import mongoose, { Types, type ClientSession } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { DomainError } from '@/domain/errors';
import { Pair } from '@/models/Pair';
import { User } from '@/models/User';
import { ensurePublicPairingId, normalizePublicPairingId, PUBLIC_PAIRING_ID_PATTERN } from '@/domain/services/userPublicIdentity.service';
import {
  PairInvite,
  type PairInviteStatus,
  type PairInviteType,
} from '@/models/PairInvite';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { pairInviteTransition } from '@/domain/state/pairInviteMachine';
import {
  activePairForAnyMember,
  canonicalPairKey,
  canonicalPairMembers,
  fencePairMembershipSlots,
  formPairInSession,
} from '@/domain/services/pairFormation.service';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';

export const PAIR_INVITE_TOKEN_BYTES = 32;
export const PAIR_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
type StoredPairInvite = PairInviteType & { _id: Types.ObjectId };

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
  awaitingOwnerConfirmation?: boolean;
  partner?: { publicId: string; username: string };
};

export type PairInviteIssueDTO = {
  invite: PairInviteOwnerDTO;
  token: string;
};

export type PairInviteResolveDTO = {
  state: 'AVAILABLE' | 'WAITING_CONFIRMATION' | 'ACCEPTED' | 'UNAVAILABLE';
  canAccept: boolean;
  expiresAt?: string;
  partner?: { publicId: string; username: string };
  pairId?: string;
};

export type PairInviteAcceptDTO = {
  status: 'AWAITING_PARTNER_CONFIRMATION';
  inviteId: string;
  alreadyAccepted: boolean;
} | {
  status: 'ACCEPTED';
  pairId: string;
  alreadyAccepted: boolean;
};

export type PairInviteReliabilityTestHooks = {
  beforeCreateMembershipFence?: () => Promise<void>;
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

const requireExistingPartnerPath = async (userId: string, session?: ClientSession): Promise<void> => {
  const query = User.findOne({ id: userId }).select({ entryCohort: 1 }).lean<{ entryCohort?: string } | null>();
  if (session) query.session(session);
  const user = await query;
  if (user?.entryCohort !== 'EXISTING_PARTNER') {
    throw new DomainError({ code: 'PAIR_ENTRY_REQUIRED', status: 409, message: 'Choose the existing partner path before linking accounts' });
  }
};

const partnerIdentity = async (userId: string) => {
  const publicId = await ensurePublicPairingId(userId);
  const user = await User.findOne({ id: userId }).select({ username: 1 }).lean<{ username: string } | null>();
  if (!user) return unavailable();
  return { publicId, username: user.username };
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

const pairMembers = canonicalPairMembers;
const pairKey = canonicalPairKey;

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

const toOwnerDetails = async (invite: StoredPairInvite): Promise<PairInviteOwnerDTO> => ({
  ...toOwnerDTO(invite),
  ...(invite.status === 'ACTIVE' && invite.acceptedByUserId && invite.recipientConfirmedAt
    ? { awaitingOwnerConfirmation: true, partner: await partnerIdentity(invite.acceptedByUserId) }
    : {}),
});

export type PairInviteLookup = { token: string; partnerCode?: never } | { partnerCode: string; token?: never };

const findInviteByLookup = async (input: PairInviteLookup): Promise<StoredPairInvite | null> => {
  if (input.token !== undefined) return PairInvite.findOne({ tokenHash: hashPairInviteToken(assertTokenFormat(input.token)) }).lean<StoredPairInvite | null>();
  const publicId = normalizePublicPairingId(input.partnerCode);
  if (!PUBLIC_PAIRING_ID_PATTERN.test(publicId)) return null;
  const owner = await User.findOne({ publicId }).select({ id: 1 }).lean<{ id: string } | null>();
  if (!owner) return null;
  return PairInvite.findOne({ creatorUserId: owner.id, status: { $in: ['ACTIVE', 'ACCEPTED'] } }).sort({ createdAt: -1 }).lean<StoredPairInvite | null>();
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

const existingAcceptedPairId = async (
  invite: StoredPairInvite,
  currentUserId: string,
  session?: ClientSession
): Promise<string> => {
  if (invite.acceptedByUserId !== currentUserId) unavailable();
  if (invite.pairId) return String(invite.pairId);

  const members = pairMembers(invite.creatorUserId, currentUserId);
  const query = Pair.findOne({ key: pairKey(members) })
    .sort({ createdAt: -1 })
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
    return { invite: invite ? await toOwnerDetails(invite) : null };
  },

  async create(input: {
    currentUserId: string;
    now?: Date;
  }, hooks: PairInviteReliabilityTestHooks = {}): Promise<PairInviteIssueDTO> {
    await connectToDatabase();
    await requireCompletedOnboarding(input.currentUserId);
    await requireExistingPartnerPath(input.currentUserId);
    const now = input.now ?? new Date();
    if (await activePairForAnyMember([input.currentUserId])) ownerHasPair();

    const session = await mongoose.startSession();
    let issued: { inviteId: Types.ObjectId; token: string } | undefined;
    try {
      issued = await session.withTransaction(async () => {
        await hooks.beforeCreateMembershipFence?.();
        await fencePairMembershipSlots([input.currentUserId], session);
        await requireExistingPartnerPath(input.currentUserId, session);
        if (await activePairForAnyMember([input.currentUserId], session)) {
          ownerHasPair();
        }
        await expireCreatorInvites(input.currentUserId, now, session);
        return issueInvite({
          creatorUserId: input.currentUserId,
          now,
          session,
        });
      });
      if (!issued) {
        throw new DomainError({
          code: 'INTERNAL',
          status: 500,
          message: 'Pair invite transaction did not complete',
        });
      }
      const invite = await PairInvite.findById(issued.inviteId).lean<StoredPairInvite | null>();
      if (!invite) {
        throw new DomainError({
          code: 'INTERNAL',
          status: 500,
          message: 'Pair invite was not found after creation',
        });
      }
      recordProductAnalyticsEvent({
        name: 'pair_invite_created',
        technicalScope: 'pair_invite',
        at: now,
      });
      return { invite: toOwnerDTO(invite), token: issued.token };
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) activeInviteExists();
      throw error;
    } finally {
      await session.endSession();
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
    return toOwnerDetails(invite);
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
    await requireExistingPartnerPath(input.currentUserId);
    const now = input.now ?? new Date();
    if (await activePairForAnyMember([input.currentUserId])) ownerHasPair();

    const session = await mongoose.startSession();
    let issued: { inviteId: Types.ObjectId; token: string } | undefined;
    try {
      issued = await session.withTransaction(async () => {
        await fencePairMembershipSlots([input.currentUserId], session);
        await requireExistingPartnerPath(input.currentUserId, session);
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

  async resolve(input: PairInviteLookup & {
    currentUserId: string;
    now?: Date;
  }): Promise<PairInviteResolveDTO> {
    await connectToDatabase();
    const now = input.now ?? new Date();
    let invite = await findInviteByLookup(input);
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
      return { state: 'ACCEPTED', canAccept: false, pairId: await existingAcceptedPairId(invite, input.currentUserId) };
    }
    if (invite.status !== 'ACTIVE' || invite.creatorUserId === input.currentUserId) {
      return { state: 'UNAVAILABLE', canAccept: false };
    }
    if (invite.acceptedByUserId && invite.acceptedByUserId !== input.currentUserId) return { state: 'UNAVAILABLE', canAccept: false };
    if (await activePairForAnyMember([invite.creatorUserId, input.currentUserId])) return { state: 'UNAVAILABLE', canAccept: false };
    return {
      state: invite.recipientConfirmedAt ? 'WAITING_CONFIRMATION' : 'AVAILABLE',
      canAccept: !invite.recipientConfirmedAt,
      expiresAt: invite.expiresAt.toISOString(),
      partner: await partnerIdentity(invite.creatorUserId),
    };
  },

  async accept(input: PairInviteLookup & {
    currentUserId: string;
    auditRequest?: AuditRequestContext;
    now?: Date;
  }): Promise<PairInviteAcceptDTO> {
    await connectToDatabase();
    await requireCompletedOnboarding(input.currentUserId);
    await requireExistingPartnerPath(input.currentUserId);
    const initial = await findInviteByLookup(input);
    if (!initial || initial.creatorUserId === input.currentUserId) return unavailable();
    const now = input.now ?? new Date();
    if (initial.status === 'ACCEPTED' && initial.acceptedByUserId === input.currentUserId) {
      return { status: 'ACCEPTED', pairId: await existingAcceptedPairId(initial, input.currentUserId), alreadyAccepted: true };
    }
    if (initial.status !== 'ACTIVE' || initial.expiresAt <= now) return unavailable();
    await ensurePublicPairingId(input.currentUserId);
    const session = await mongoose.startSession();
    try {
      const claimed = await session.withTransaction(async () => {
        const members = pairMembers(initial.creatorUserId, input.currentUserId);
        await fencePairMembershipSlots(members, session);
        await requireExistingPartnerPath(initial.creatorUserId, session);
        await requireExistingPartnerPath(input.currentUserId, session);
        if (await activePairForAnyMember(members, session)) return unavailable();
        return PairInvite.findOneAndUpdate({
          _id: initial._id, status: 'ACTIVE', expiresAt: { $gt: now },
          $or: [{ acceptedByUserId: { $exists: false } }, { acceptedByUserId: input.currentUserId }],
        }, { $set: { acceptedByUserId: input.currentUserId, recipientConfirmedAt: initial.recipientConfirmedAt ?? now } }, { new: true, session }).lean<StoredPairInvite | null>();
      });
      if (!claimed) return unavailable();
      return { status: 'AWAITING_PARTNER_CONFIRMATION', inviteId: String(claimed._id), alreadyAccepted: Boolean(initial.recipientConfirmedAt) };
    } finally { await session.endSession(); }
  },

  async confirm(input: {
    currentUserId: string;
    inviteId: string;
    partnerPublicId: string;
    auditRequest?: AuditRequestContext;
    now?: Date;
  }): Promise<Extract<PairInviteAcceptDTO, { status: 'ACCEPTED' }>> {
    await connectToDatabase();
    await requireCompletedOnboarding(input.currentUserId);
    if (!Types.ObjectId.isValid(input.inviteId)) return ownerInviteNotFound();
    const initial = await PairInvite.findOne({ _id: input.inviteId, creatorUserId: input.currentUserId }).lean<StoredPairInvite | null>();
    if (!initial || !initial.acceptedByUserId || !initial.recipientConfirmedAt) return unavailable();
    const recipientUserId = initial.acceptedByUserId;
    const partner = await partnerIdentity(recipientUserId);
    if (partner.publicId !== normalizePublicPairingId(input.partnerPublicId)) return unavailable();
    const now = input.now ?? new Date();

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
      { currentUserId: recipientUserId, now }
    );
    if (initialTransition.reason === 'INVITE_ACCEPT_NOOP') {
      return {
        status: 'ACCEPTED',
        pairId: await existingAcceptedPairId(initial, recipientUserId),
        alreadyAccepted: true,
      };
    }

    const members = pairMembers(initial.creatorUserId, recipientUserId);
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
          if (invite.creatorUserId !== input.currentUserId || invite.acceptedByUserId !== recipientUserId || !invite.recipientConfirmedAt) return { kind: 'unavailable' };

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
            { currentUserId: recipientUserId, now }
          );
          const liveMembers = pairMembers(invite.creatorUserId, recipientUserId);
          if (transition.reason === 'INVITE_ACCEPT_NOOP') {
            return {
              kind: 'accepted',
              pairId: await existingAcceptedPairId(invite, recipientUserId, session),
              members: liveMembers,
              alreadyAccepted: true,
            };
          }

          // Formation writes both User fences, so a concurrent cohort change
          // after these reads forces a retry of this transaction.
          await requireExistingPartnerPath(invite.creatorUserId, session);
          await requireExistingPartnerPath(recipientUserId, session);
          const formation = await formPairInSession({
            source: 'PAIR_INVITE',
            sourceId: String(invite._id),
            members: liveMembers,
            now,
            session,
          });
          const targetPairId = new Types.ObjectId(formation.pairId);

          const accepted = await PairInvite.findOneAndUpdate(
            {
              _id: invite._id,
              status: 'ACTIVE',
              expiresAt: { $gt: now },
            },
            {
              $set: {
                status: transition.next.status,
                acceptedByUserId: recipientUserId,
                creatorConfirmedAt: now,
                acceptedAt: transition.next.acceptedAt ?? now,
                pairId: targetPairId,
              },
            },
            { new: true, session }
          ).lean<StoredPairInvite | null>();
          if (!accepted) unavailable();

          await PairInvite.updateMany(
            {
              _id: { $ne: invite._id },
              creatorUserId: { $in: liveMembers },
              status: 'ACTIVE',
            },
            { $set: { status: 'CANCELLED' } },
            { session }
          );

          return {
            kind: 'accepted',
            pairId: String(targetPairId),
            members: liveMembers,
            alreadyAccepted: formation.alreadyFormed,
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
          route: '/api/pair-invites/[id]/confirm',
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
      recordProductAnalyticsEvent({
        name: 'pair_joined',
        technicalScope: 'pair_invite',
        at: now,
      });
      recordOperationalEvent({
        name: 'invite_converted',
        routeGroup: 'pair_invite',
        outcome: 'ok',
      });
    }

    return {
      status: 'ACCEPTED',
      pairId: result.pairId,
      alreadyAccepted: result.alreadyAccepted,
    };
  },
};
