import { connectToDatabase } from '@/lib/mongodb';
import { User, type UserType } from '@/models/User';
import { DomainError } from '@/domain/errors';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import type { JsonValue } from '@/lib/api/response';

export type UserProfileUpsertPayload = {
  username?: UserType['username'];
  avatar?: UserType['avatar'];
  personal?: UserType['personal'];
  vectors?: UserType['vectors'];
  preferences?: UserType['preferences'];
  embeddings?: UserType['embeddings'];
  location?: UserType['location'];
};

export type MatchCardPayload = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
  isActive: boolean;
};

const profileUpsertFields = [
  'username',
  'avatar',
  'personal',
  'vectors',
  'preferences',
  'embeddings',
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

export const usersService = {
  async upsertCurrentUserProfile(input: {
    currentUserId: string;
    payload: UserProfileUpsertPayload;
    auditRequest?: AuditRequestContext;
  }): Promise<UserType> {
    await connectToDatabase();

    const updateFields = toUpdateFields(input.payload);
    const doc = await User.findOneAndUpdate(
      { id: input.currentUserId },
      {
        $set: updateFields,
        $setOnInsert: { id: input.currentUserId },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).lean<UserType | null>();

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
  }): Promise<UserType> {
    await connectToDatabase();

    const updateFields = toUpdateFields(input.payload);
    const doc = await User.findOneAndUpdate(
      { id: input.currentUserId },
      updateFields,
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

    return doc;
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
  }): Promise<UserType> {
    await connectToDatabase();

    const updateFields = toUpdateFields(input.payload);
    const doc = await User.findOneAndUpdate(
      { id: input.targetUserId },
      updateFields,
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

    return doc;
  },

  async updateUserOnboardingById(input: {
    targetUserId: string;
    actorUserId: string;
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

  async upsertCurrentUserMatchCard(input: {
    currentUserId: string;
    payload: MatchCardPayload;
    auditRequest?: AuditRequestContext;
  }): Promise<UserType> {
    await connectToDatabase();

    const doc = await User.findOneAndUpdate(
      { id: input.currentUserId },
      {
        $set: {
          'profile.matchCard': {
            requirements: input.payload.requirements,
            give: input.payload.give,
            questions: input.payload.questions,
            isActive: input.payload.isActive,
            updatedAt: new Date(),
          },
        },
      },
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
      event: 'MATCH_CARD_UPDATED',
      actor: { userId: input.currentUserId },
      request: input.auditRequest ?? { route: '/api/match/card', method: 'POST' },
      target: {
        type: 'user',
        id: input.currentUserId,
      },
      metadata: {
        userId: input.currentUserId,
        isActive: input.payload.isActive,
        requirementsCount: input.payload.requirements.length,
        questionsCount: input.payload.questions.length,
      },
    });

    return doc;
  },
};
