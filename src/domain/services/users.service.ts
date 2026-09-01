import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import type { JsonValue } from '@/lib/api/response';
import { toUserDTO, type UserDTO } from '@/lib/dto/user.dto';
import { CandidateDiscoveryProjection } from '@/models/CandidateDiscoveryProjection';
import { CandidatePresentationGrant } from '@/models/CandidatePresentationGrant';
import { MatchingProfile } from '@/models/MatchingProfile';

export type UserProfileUpsertPayload = {
  username?: UserType['username'];
  avatar?: UserType['avatar'];
  personal?: UserType['personal'];
  preferences?: UserType['preferences'];
  location?: UserType['location'];
};

const profileUpsertFields = [
  'username',
  'avatar',
  'personal',
  'preferences',
  'location',
] as const;

const toUpdateFields = (payload: UserProfileUpsertPayload): Record<string, unknown> => {
  const update: Record<string, unknown> = {};
  for (const field of profileUpsertFields) {
    const value = payload[field];
    if (value !== undefined) {
      update[field] = value;
    }
  }
  return update;
};

const changesDiscoveryInputs = (fields: Record<string, unknown>): boolean =>
  ['personal', 'preferences', 'location'].some((field) =>
    Object.hasOwn(fields, field)
  );

const updateUserProfileDocument = async (input: {
  userId: string;
  fields: Record<string, unknown>;
  upsert: boolean;
}): Promise<UserType | null> => {
  if (!changesDiscoveryInputs(input.fields)) {
    return User.findOneAndUpdate(
      { id: input.userId },
      {
        $set: input.fields,
        ...(input.upsert ? { $setOnInsert: { id: input.userId } } : {}),
      },
      {
        upsert: input.upsert,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: false,
      }
    ).lean<UserType | null>();
  }

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => {
      const now = new Date();
      const user = await User.findOneAndUpdate(
        { id: input.userId },
        {
          $set: input.fields,
          $inc: { pairMembershipRevision: 1 },
          ...(input.upsert ? { $setOnInsert: { id: input.userId } } : {}),
        },
        {
          upsert: input.upsert,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: false,
          session,
        }
      ).lean<UserType | null>();
      if (!user) return null;
      await Promise.all([
        MatchingProfile.updateOne(
          { userId: input.userId },
          { $set: { active: false } },
          { session }
        ),
        CandidateDiscoveryProjection.updateOne(
          { userId: input.userId },
          { $set: { active: false } },
          { session }
        ),
        CandidatePresentationGrant.updateMany(
          {
            $or: [
              { requesterId: input.userId },
              { candidateId: input.userId },
            ],
            revokedAt: { $exists: false },
          },
          { $set: { revokedAt: now } },
          { session }
        ),
      ]);
      return user;
    });
    return result ?? null;
  } finally {
    await session.endSession();
  }
};

export const assertSelfUserTarget = (actorUserId: string, targetUserId: string): void => {
  if (actorUserId !== targetUserId) {
    throw new DomainError({
      code: 'ACCESS_DENIED',
      status: 403,
      message: 'forbidden',
    });
  }
};

export const usersService = {
  async getCurrentUserProfile(currentUserId: string): Promise<UserDTO | null> {
    await connectToDatabase();

    const user = await User.findOne({ id: currentUserId }).lean<UserType | null>();
    return user
      ? toUserDTO(user, {
          scope: 'private',
          includeOnboarding: true,
          includeMatchCard: true,
          includeLocation: true,
        })
      : null;
  },

  async getPublicUserProfile(userId: string): Promise<UserDTO | null> {
    await connectToDatabase();

    const user = await User.findOne({ id: userId }).lean<UserType | null>();
    return user ? toUserDTO(user, { scope: 'public' }) : null;
  },

  async upsertCurrentUserProfile(input: {
    currentUserId: string;
    payload: UserProfileUpsertPayload;
    auditRequest?: AuditRequestContext;
  }): Promise<UserType> {
    await connectToDatabase();

    const updateFields = toUpdateFields(input.payload);
    const doc = await updateUserProfileDocument({
      userId: input.currentUserId,
      fields: updateFields,
      upsert: true,
    });

    if (!doc) {
      throw new DomainError({
        code: 'INTERNAL',
        status: 500,
        message: 'Failed to upsert user profile',
      });
    }

    await emitEvent({
      event: 'USER_PROFILE_UPSERTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/users', method: 'POST' },
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        userId: input.currentUserId,
        fields: Object.keys(updateFields),
      },
    });

    return doc;
  },

  async updateCurrentUserProfile(input: {
    currentUserId: string;
    payload: UserProfileUpsertPayload;
    auditRequest?: AuditRequestContext;
  }): Promise<UserDTO> {
    await connectToDatabase();

    const updateFields = toUpdateFields(input.payload);
    const doc = await updateUserProfileDocument({
      userId: input.currentUserId,
      fields: updateFields,
      upsert: false,
    });

    if (!doc) {
      throw new DomainError({
        code: 'USER_NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    await emitEvent({
      event: 'USER_PROFILE_UPSERTED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/users/me', method: 'PUT' },
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        userId: input.currentUserId,
        fields: Object.keys(updateFields),
      },
    });

    return toUserDTO(doc, {
      scope: 'private',
      includeOnboarding: true,
      includeMatchCard: true,
      includeLocation: true,
    });
  },

  async updateCurrentUserOnboarding(input: {
    currentUserId: string;
    patch: Record<string, JsonValue>;
    auditRequest?: AuditRequestContext;
  }): Promise<UserType> {
    await connectToDatabase();

    const set: Record<string, JsonValue> = {};
    const updatedKeys: string[] = [];
    for (const [key, value] of Object.entries(input.patch)) {
      set[`profile.onboarding.${key}`] = value;
      updatedKeys.push(key);
    }

    if (updatedKeys.length === 0) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Onboarding patch cannot be empty',
      });
    }

    const doc = await User.findOneAndUpdate(
      { id: input.currentUserId },
      { $set: set },
      { new: true, runValidators: true }
    ).lean<UserType | null>();

    if (!doc) {
      throw new DomainError({
        code: 'USER_NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    await emitEvent({
      event: 'USER_ONBOARDING_UPDATED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/users/me/onboarding', method: 'PATCH' },
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        updatedKeys,
      },
    });

    return doc;
  },

  async updateUserProfileById(input: {
    targetUserId: string;
    actorUserId: string;
    payload: UserProfileUpsertPayload;
    auditRequest?: AuditRequestContext;
  }): Promise<UserDTO> {
    assertSelfUserTarget(input.actorUserId, input.targetUserId);
    await connectToDatabase();

    const updateFields = toUpdateFields(input.payload);
    const doc = await updateUserProfileDocument({
      userId: input.targetUserId,
      fields: updateFields,
      upsert: false,
    });

    if (!doc) {
      throw new DomainError({
        code: 'USER_NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    await emitEvent({
      event: 'USER_PROFILE_UPSERTED',
      actor: { userId: input.actorUserId },
      request: input.auditRequest ?? { route: `/api/users/${input.targetUserId}`, method: 'PUT' },
      target: {
        type: 'user',
        id: input.targetUserId,
      },
      metadata: {
        userId: input.targetUserId,
        fields: Object.keys(updateFields),
      },
    });

    return toUserDTO(doc, { scope: 'public' });
  },

  async updateUserOnboardingById(input: {
    targetUserId: string;
    actorUserId: string;
    patch: Record<string, JsonValue>;
    auditRequest?: AuditRequestContext;
  }): Promise<UserType> {
    assertSelfUserTarget(input.actorUserId, input.targetUserId);
    await connectToDatabase();

    const set: Record<string, JsonValue> = {};
    const updatedKeys: string[] = [];
    for (const [key, value] of Object.entries(input.patch)) {
      set[`profile.onboarding.${key}`] = value;
      updatedKeys.push(key);
    }

    if (updatedKeys.length === 0) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        status: 400,
        message: 'Onboarding patch cannot be empty',
      });
    }

    const doc = await User.findOneAndUpdate(
      { id: input.targetUserId },
      { $set: set },
      { new: true, runValidators: true }
    ).lean<UserType | null>();

    if (!doc) {
      throw new DomainError({
        code: 'USER_NOT_FOUND',
        status: 404,
        message: 'User not found',
      });
    }

    await emitEvent({
      event: 'USER_ONBOARDING_UPDATED',
      actor: { userId: input.actorUserId },
      request:
        input.auditRequest ??
        { route: `/api/users/${input.targetUserId}/onboarding`, method: 'PATCH' },
      target: {
        type: 'user',
        id: input.targetUserId,
      },
      metadata: {
        updatedKeys,
      },
    });

    return doc;
  },

};
