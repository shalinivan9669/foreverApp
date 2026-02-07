import type { UserType } from '@/models/User';

type DateLike = Date | string | undefined | null;

const toIso = (value: DateLike): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
};

const toTuple3 = (items: string[] | undefined): [string, string, string] | null => {
  if (!items || items.length < 3) return null;
  return [String(items[0] ?? ''), String(items[1] ?? ''), String(items[2] ?? '')];
};

const toTuple2 = (items: string[] | undefined): [string, string] | null => {
  if (!items || items.length < 2) return null;
  return [String(items[0] ?? ''), String(items[1] ?? '')];
};

export const PUBLIC_USER_FIELDS = ['id', 'username', 'avatar'] as const;
export const PRIVATE_USER_FIELDS = [
  'personal',
  'vectors',
  'preferences',
  'profile.onboarding',
  'profile.matchCard',
  'location',
  'createdAt',
  'updatedAt',
] as const;

export type PublicUserDTO = {
  id: string;
  username: string;
  avatar: string;
};

export type UserMatchCardDTO = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
  isActive: boolean;
  updatedAt?: string;
};

export type UserOnboardingDTO = NonNullable<NonNullable<UserType['profile']>['onboarding']>;

export type UserDTO = PublicUserDTO & {
  personal?: UserType['personal'];
  vectors?: UserType['vectors'];
  preferences?: UserType['preferences'];
  profile?: {
    onboarding?: UserOnboardingDTO;
    matchCard?: UserMatchCardDTO;
  };
  location?: UserType['location'];
  createdAt?: string;
  updatedAt?: string;
};

type MatchCardSource = NonNullable<NonNullable<UserType['profile']>['matchCard']>;

type UserSource = Pick<UserType, 'id' | 'username' | 'avatar'> &
  Partial<
    Pick<UserType, 'personal' | 'vectors' | 'preferences' | 'profile' | 'location' | 'createdAt' | 'updatedAt'>
  >;

export type ToUserDtoOptions = {
  scope?: 'public' | 'private';
  includeOnboarding?: boolean;
  includeMatchCard?: boolean;
  includeLocation?: boolean;
};

export function toUserMatchCardDTO(card: MatchCardSource | null | undefined): UserMatchCardDTO | null {
  if (!card) return null;
  const requirements = toTuple3(card.requirements);
  const give = toTuple3(card.give);
  const questions = toTuple2(card.questions);
  if (!requirements || !give || !questions) return null;

  return {
    requirements,
    give,
    questions,
    isActive: Boolean(card.isActive),
    updatedAt: toIso(card.updatedAt),
  };
}

export function toUserDTO(user: UserSource, opts: ToUserDtoOptions = {}): UserDTO {
  const scope = opts.scope ?? 'public';
  const dto: UserDTO = {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
  };

  if (scope === 'private') {
    if (user.personal) dto.personal = user.personal;
    if (user.vectors) dto.vectors = user.vectors;
    if (user.preferences) dto.preferences = user.preferences;
    dto.createdAt = toIso(user.createdAt);
    dto.updatedAt = toIso(user.updatedAt);

    const profile: NonNullable<UserDTO['profile']> = {};
    if (opts.includeOnboarding && user.profile?.onboarding) {
      profile.onboarding = user.profile.onboarding;
    }
    if (opts.includeMatchCard) {
      const card = toUserMatchCardDTO(user.profile?.matchCard ?? null);
      if (card) profile.matchCard = card;
    }
    if (Object.keys(profile).length > 0) {
      dto.profile = profile;
    }

    if (opts.includeLocation && user.location) {
      dto.location = user.location;
    }
  }

  return dto;
}

