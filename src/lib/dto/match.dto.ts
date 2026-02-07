import type { LikeStatus, LikeType } from '@/models/Like';
import type { UserType } from '@/models/User';

export type MatchFeedCandidateDTO = {
  id: string;
  username: string;
  avatar: string;
  score: number;
};

export type MatchCardDTO = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
  isActive: boolean;
  updatedAt?: string;
};

export type LikeDecisionDTO = {
  accepted: boolean;
  at: string;
};

export type LikePeerDTO = {
  id: string;
  username: string;
  avatar: string;
};

export type LikeDTO = {
  id: string;
  status: LikeStatus;
  matchScore: number;
  updatedAt?: string;
  from: LikePeerDTO;
  to: LikePeerDTO;
  agreements?: [boolean, boolean, boolean];
  answers?: [string, string];
  cardSnapshot?: LikeType['cardSnapshot'];
  fromCardSnapshot?: LikeType['fromCardSnapshot'];
  recipientResponse: null | {
    agreements: [boolean, boolean, boolean];
    answers: [string, string];
    initiatorCardSnapshot: NonNullable<LikeType['recipientResponse']>['initiatorCardSnapshot'];
    at: string;
  };
  decisions: {
    initiator: LikeDecisionDTO | null;
    recipient: LikeDecisionDTO | null;
  };
};

export type LikeSummaryDTO = {
  id: string;
  status: LikeStatus;
  matchScore: number;
  updatedAt?: string;
  fromId: string;
  toId: string;
  recipientResponse: LikeDTO['recipientResponse'];
};

type IdLike = string | { toString(): string };
type DateLike = Date | string | undefined | null;

const toIso = (value: DateLike): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
};

const toId = (value: IdLike | undefined): string => (value ? String(value) : '');

const toTuple3Bool = (items: boolean[] | undefined): [boolean, boolean, boolean] | undefined => {
  if (!items || items.length < 3) return undefined;
  return [Boolean(items[0]), Boolean(items[1]), Boolean(items[2])];
};

const toTuple2String = (items: string[] | undefined): [string, string] | undefined => {
  if (!items || items.length < 2) return undefined;
  return [String(items[0] ?? ''), String(items[1] ?? '')];
};

const toAvatarUrl = (id: string, avatarHash?: string): string =>
  avatarHash
    ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';

type MatchCardSource = NonNullable<NonNullable<UserType['profile']>['matchCard']>;

type LikeSource = Omit<LikeType, '_id'> & {
  _id: IdLike;
};

type UserLite = Pick<UserType, 'id' | 'username' | 'avatar'>;

export type ToLikeDtoOptions = {
  fromUser?: UserLite | null;
  toUser?: UserLite | null;
  includeLegacy?: boolean;
  avatarMode?: 'url' | 'hash';
};

export function toMatchFeedCandidateDTO(user: UserLite, score: number): MatchFeedCandidateDTO {
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    score,
  };
}

export function toMatchCardDTO(card: MatchCardSource | null | undefined): MatchCardDTO | null {
  if (!card) return null;

  if (card.requirements.length < 3 || card.give.length < 3 || card.questions.length < 2) {
    return null;
  }

  return {
    requirements: [
      String(card.requirements[0] ?? ''),
      String(card.requirements[1] ?? ''),
      String(card.requirements[2] ?? ''),
    ],
    give: [
      String(card.give[0] ?? ''),
      String(card.give[1] ?? ''),
      String(card.give[2] ?? ''),
    ],
    questions: [String(card.questions[0] ?? ''), String(card.questions[1] ?? '')],
    isActive: Boolean(card.isActive),
    updatedAt: toIso(card.updatedAt),
  };
}

export function toLikeDTO(like: LikeSource, opts: ToLikeDtoOptions = {}): LikeDTO {
  const includeLegacy = opts.includeLegacy ?? true;
  const avatarMode = opts.avatarMode ?? 'url';

  const fromId = like.fromId;
  const toIdValue = like.toId;
  const fromUser = opts.fromUser;
  const toUser = opts.toUser;

  const fromAvatarHash = fromUser?.avatar;
  const toAvatarHash = toUser?.avatar;

  const fromAvatar = avatarMode === 'url' ? toAvatarUrl(fromId, fromAvatarHash) : fromAvatarHash ?? '';
  const toAvatar = avatarMode === 'url' ? toAvatarUrl(toIdValue, toAvatarHash) : toAvatarHash ?? '';

  const dto: LikeDTO = {
    id: toId(like._id),
    status: like.status,
    matchScore: like.matchScore,
    updatedAt: toIso(like.updatedAt),
    from: {
      id: fromId,
      username: fromUser?.username ?? fromId,
      avatar: fromAvatar,
    },
    to: {
      id: toIdValue,
      username: toUser?.username ?? toIdValue,
      avatar: toAvatar,
    },
    fromCardSnapshot: like.fromCardSnapshot,
    recipientResponse: like.recipientResponse
      ? {
          agreements: [
            Boolean(like.recipientResponse.agreements[0]),
            Boolean(like.recipientResponse.agreements[1]),
            Boolean(like.recipientResponse.agreements[2]),
          ],
          answers: [
            String(like.recipientResponse.answers[0] ?? ''),
            String(like.recipientResponse.answers[1] ?? ''),
          ],
          initiatorCardSnapshot: like.recipientResponse.initiatorCardSnapshot,
          at: toIso(like.recipientResponse.at) ?? '',
        }
      : null,
    decisions: {
      initiator: like.initiatorDecision
        ? {
            accepted: like.initiatorDecision.accepted,
            at: toIso(like.initiatorDecision.at) ?? '',
          }
        : null,
      recipient: like.recipientDecision
        ? {
            accepted: like.recipientDecision.accepted,
            at: toIso(like.recipientDecision.at) ?? '',
          }
        : null,
    },
  };

  if (includeLegacy) {
    dto.agreements = toTuple3Bool(like.agreements);
    dto.answers = toTuple2String(like.answers);
    dto.cardSnapshot = like.cardSnapshot;
  }

  return dto;
}

export function toLikeSummaryDTO(like: LikeSource): LikeSummaryDTO {
  return {
    id: toId(like._id),
    status: like.status,
    matchScore: like.matchScore,
    updatedAt: toIso(like.updatedAt),
    fromId: like.fromId,
    toId: like.toId,
    recipientResponse: like.recipientResponse
      ? {
          agreements: [
            Boolean(like.recipientResponse.agreements[0]),
            Boolean(like.recipientResponse.agreements[1]),
            Boolean(like.recipientResponse.agreements[2]),
          ],
          answers: [
            String(like.recipientResponse.answers[0] ?? ''),
            String(like.recipientResponse.answers[1] ?? ''),
          ],
          initiatorCardSnapshot: like.recipientResponse.initiatorCardSnapshot,
          at: toIso(like.recipientResponse.at) ?? '',
        }
      : null,
  };
}
