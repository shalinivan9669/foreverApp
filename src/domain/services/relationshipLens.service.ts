import { connectToDatabase } from '@/lib/mongodb';
import { DomainError } from '@/domain/errors';
import { User, type UserType } from '@/models/User';
import type {
  RelationshipLensSource,
  RelationshipLensType,
} from '@/models/PersonalDailyCheckIn';

export type RelationshipLens = {
  type: RelationshipLensType;
  source: RelationshipLensSource;
  canChange: true;
};

export type RelationshipLensPatch = {
  defaultLens?: RelationshipLensType;
  preferredSupportStyle?:
    | 'listen'
    | 'solve'
    | 'hug'
    | 'space'
    | 'practical_help'
    | 'soft_presence';
  conflictPattern?:
    | 'withdraw'
    | 'argue'
    | 'freeze'
    | 'explain'
    | 'please'
    | 'avoid';
  privacyDefaults?: {
    dailyStatePrivate?: boolean;
    journalPrivate?: boolean;
    bodyContextPrivate?: boolean;
    partnerSignalsEnabled?: boolean;
    pairMapContributionEnabled?: boolean;
  };
};

type UserLensInput = Pick<UserType, 'personal' | 'profile'>;

const isLensType = (value: string | undefined): value is RelationshipLensType =>
  value === 'feminine' ||
  value === 'masculine' ||
  value === 'balanced' ||
  value === 'custom';

export const resolveRelationshipLens = (user: UserLensInput): RelationshipLens => {
  const savedLens = user.profile?.relationshipLens?.defaultLens;
  if (isLensType(savedLens)) {
    return {
      type: savedLens,
      source: 'user_setting',
      canChange: true,
    };
  }

  if (user.personal?.gender === 'female') {
    return {
      type: 'feminine',
      source: 'gender_default',
      canChange: true,
    };
  }

  if (user.personal?.gender === 'male') {
    return {
      type: 'masculine',
      source: 'gender_default',
      canChange: true,
    };
  }

  return {
    type: 'balanced',
    source: 'gender_default',
    canChange: true,
  };
};

export const updateRelationshipLens = async (input: {
  currentUserId: string;
  patch: RelationshipLensPatch;
}): Promise<RelationshipLens> => {
  await connectToDatabase();

  const setPayload: Record<string, RelationshipLensPatch[keyof RelationshipLensPatch] | string> = {};
  if (input.patch.defaultLens) {
    setPayload['profile.relationshipLens.defaultLens'] = input.patch.defaultLens;
    setPayload['profile.relationshipLens.source'] = 'user_setting';
  }
  if (input.patch.preferredSupportStyle) {
    setPayload['profile.relationshipLens.preferredSupportStyle'] =
      input.patch.preferredSupportStyle;
  }
  if (input.patch.conflictPattern) {
    setPayload['profile.relationshipLens.conflictPattern'] = input.patch.conflictPattern;
  }
  if (input.patch.privacyDefaults) {
    setPayload['profile.relationshipLens.privacyDefaults'] = input.patch.privacyDefaults;
  }

  const user =
    Object.keys(setPayload).length > 0
      ? await User.findOneAndUpdate(
          { id: input.currentUserId },
          { $set: setPayload },
          { new: true }
        ).lean<UserLensInput | null>()
      : await User.findOne({ id: input.currentUserId }).lean<UserLensInput | null>();

  if (!user) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'User not found',
    });
  }

  return resolveRelationshipLens(user);
};
