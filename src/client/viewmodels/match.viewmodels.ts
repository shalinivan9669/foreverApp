import type {
  MatchCardSnapshotDTO,
  MatchFeedCandidateDTO,
  MatchInboxRowDTO,
  MatchLikeDTO,
} from '@/client/api/types';

export type MatchDirectionVM = 'incoming' | 'outgoing';
export type MatchStatusVM =
  | 'sent'
  | 'viewed'
  | 'awaiting_initiator'
  | 'mutual_ready'
  | 'paired'
  | 'rejected'
  | 'expired';

export type MatchFeedCandidateVM = {
  id: string;
  username: string;
  avatar: string;
  score: number;
};

export type MatchInboxRowVM = {
  id: string;
  direction: MatchDirectionVM;
  status: MatchStatusVM;
  matchScore: number;
  updatedAt?: string;
  peer: {
    id: string;
    username: string;
    avatar: string;
  };
  canCreatePair: boolean;
};

export type MatchCardSnapshotVM = {
  requirements: [string, string, string];
  questions: [string, string];
  updatedAt?: string;
};

export type MatchLikeVM = {
  id: string;
  status: MatchStatusVM;
  matchScore: number;
  updatedAt?: string;
  from: {
    id: string;
    username: string;
    avatar: string;
  };
  to: {
    id: string;
    username: string;
    avatar: string;
  };
  agreements: [boolean, boolean, boolean];
  answers: [string, string];
  cardSnapshot: MatchCardSnapshotVM | null;
  fromCardSnapshot: MatchCardSnapshotVM | null;
  recipientResponse: null | {
    agreements: [boolean, boolean, boolean];
    answers: [string, string];
    initiatorCardSnapshot: MatchCardSnapshotVM;
    at: string;
  };
  decisions: {
    initiator: { accepted: boolean; at: string } | null;
    recipient: { accepted: boolean; at: string } | null;
  };
};

const toStringTuple3 = (value: [string, string, string] | string[] | undefined): [string, string, string] => [
  value?.[0] ?? '',
  value?.[1] ?? '',
  value?.[2] ?? '',
];

const toStringTuple2 = (value: [string, string] | string[] | undefined): [string, string] => [
  value?.[0] ?? '',
  value?.[1] ?? '',
];

const toBooleanTuple3 = (
  value: [boolean, boolean, boolean] | boolean[] | undefined
): [boolean, boolean, boolean] => [value?.[0] === true, value?.[1] === true, value?.[2] === true];

const createEmptySnapshot = (): MatchCardSnapshotVM => ({
  requirements: ['', '', ''],
  questions: ['', ''],
});

export const toMatchCardSnapshotVM = (
  snapshot?: MatchCardSnapshotDTO | null
): MatchCardSnapshotVM | null => {
  if (!snapshot) return null;
  return {
    requirements: toStringTuple3(snapshot.requirements),
    questions: toStringTuple2(snapshot.questions),
    updatedAt: snapshot.updatedAt,
  };
};

export const toMatchFeedCandidateVM = (
  candidate: MatchFeedCandidateDTO
): MatchFeedCandidateVM => ({
  id: candidate.id,
  username: candidate.username,
  avatar: candidate.avatar,
  score: candidate.score,
});

export const toMatchFeedCandidateVMList = (
  rows: MatchFeedCandidateDTO[] | null | undefined
): MatchFeedCandidateVM[] => {
  if (!Array.isArray(rows)) return [];
  return rows.map(toMatchFeedCandidateVM);
};

export const toMatchInboxRowVM = (row: MatchInboxRowDTO): MatchInboxRowVM => ({
  id: row.id,
  direction: row.direction,
  status: row.status,
  matchScore: row.matchScore,
  updatedAt: row.updatedAt,
  peer: {
    id: row.peer.id,
    username: row.peer.username,
    avatar: row.peer.avatar,
  },
  canCreatePair: row.canCreatePair,
});

export const toMatchInboxRowVMList = (
  rows: MatchInboxRowDTO[] | null | undefined
): MatchInboxRowVM[] => {
  if (!Array.isArray(rows)) return [];
  return rows.map(toMatchInboxRowVM);
};

export const toMatchLikeVM = (like: MatchLikeDTO): MatchLikeVM => ({
  id: like.id,
  status: like.status,
  matchScore: like.matchScore,
  updatedAt: like.updatedAt,
  from: {
    id: like.from.id,
    username: like.from.username,
    avatar: like.from.avatar,
  },
  to: {
    id: like.to.id,
    username: like.to.username,
    avatar: like.to.avatar,
  },
  agreements: toBooleanTuple3(like.agreements),
  answers: toStringTuple2(like.answers),
  cardSnapshot: toMatchCardSnapshotVM(like.cardSnapshot),
  fromCardSnapshot: toMatchCardSnapshotVM(like.fromCardSnapshot),
  recipientResponse: like.recipientResponse
    ? {
        agreements: toBooleanTuple3(like.recipientResponse.agreements),
        answers: toStringTuple2(like.recipientResponse.answers),
        initiatorCardSnapshot:
          toMatchCardSnapshotVM(like.recipientResponse.initiatorCardSnapshot) ??
          createEmptySnapshot(),
        at: like.recipientResponse.at,
      }
    : null,
  decisions: {
    initiator: like.decisions?.initiator
      ? {
          accepted: like.decisions.initiator.accepted,
          at: like.decisions.initiator.at,
        }
      : null,
    recipient: like.decisions?.recipient
      ? {
          accepted: like.decisions.recipient.accepted,
          at: like.decisions.recipient.at,
        }
      : null,
  },
});
