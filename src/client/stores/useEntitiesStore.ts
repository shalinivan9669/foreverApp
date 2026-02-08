import { create } from 'zustand';
import type {
  CurrentUserDTO,
  MatchFeedCandidateDTO,
  MatchInboxRowDTO,
  MatchLikeDTO,
  PairActivityDTO,
  PairDTO,
  PairMeDTO,
  PairStatusDTO,
  PublicUserDTO,
  QuestionnaireCardDTO,
} from '@/client/api/types';

type CachedList<T> = {
  data: T[];
  updatedAt: number;
};

type CachedValue<T> = {
  data: T;
  updatedAt: number;
};

type EntitiesState = {
  usersById: Record<string, PublicUserDTO>;
  pairsById: Record<string, PairDTO>;
  activitiesById: Record<string, PairActivityDTO>;
  likesById: Record<string, MatchLikeDTO>;
  questionnairesById: Record<string, QuestionnaireCardDTO>;

  matchFeedByKey: Record<string, CachedList<MatchFeedCandidateDTO>>;
  inboxByKey: Record<string, CachedList<MatchInboxRowDTO>>;
  activitiesByKey: Record<string, CachedList<PairActivityDTO>>;
  questionnairesByKey: Record<string, CachedList<QuestionnaireCardDTO>>;
  pairStatusByKey: Record<string, CachedValue<PairStatusDTO>>;
  pairMeByKey: Record<string, CachedValue<PairMeDTO>>;
  currentUserByKey: Record<string, CachedValue<CurrentUserDTO>>;

  setUsers: (users: PublicUserDTO[]) => void;
  setPairs: (pairs: PairDTO[]) => void;
  setActivities: (activities: PairActivityDTO[]) => void;
  setLikes: (likes: MatchLikeDTO[]) => void;
  setQuestionnaires: (questionnaires: QuestionnaireCardDTO[]) => void;

  setMatchFeed: (key: string, rows: MatchFeedCandidateDTO[]) => void;
  setInbox: (key: string, rows: MatchInboxRowDTO[]) => void;
  setActivitiesList: (key: string, rows: PairActivityDTO[]) => void;
  setQuestionnaireCards: (key: string, rows: QuestionnaireCardDTO[]) => void;
  setPairStatus: (key: string, status: PairStatusDTO) => void;
  setPairMe: (key: string, pair: PairMeDTO) => void;
  setCurrentUser: (key: string, user: CurrentUserDTO) => void;

  getMatchFeed: (key: string) => MatchFeedCandidateDTO[] | null;
  getInbox: (key: string) => MatchInboxRowDTO[] | null;
  getActivitiesList: (key: string) => PairActivityDTO[] | null;
  getQuestionnaireCards: (key: string) => QuestionnaireCardDTO[] | null;
  getPairStatus: (key: string) => PairStatusDTO | null;
  getPairMe: (key: string) => PairMeDTO | null;
  getCurrentUser: (key: string) => CurrentUserDTO | null;
};

const setById = <T extends { id: string }>(prev: Record<string, T>, rows: T[]): Record<string, T> => {
  if (rows.length === 0) return prev;
  const next = { ...prev };
  for (const row of rows) {
    next[row.id] = row;
  }
  return next;
};

const toActivityId = (activity: PairActivityDTO): string => activity._id ?? activity.id;

export const useEntitiesStore = create<EntitiesState>((set, get) => ({
  usersById: {},
  pairsById: {},
  activitiesById: {},
  likesById: {},
  questionnairesById: {},

  matchFeedByKey: {},
  inboxByKey: {},
  activitiesByKey: {},
  questionnairesByKey: {},
  pairStatusByKey: {},
  pairMeByKey: {},
  currentUserByKey: {},

  setUsers: (users) =>
    set((state) => ({
      usersById: setById(state.usersById, users),
    })),

  setPairs: (pairs) =>
    set((state) => ({
      pairsById: setById(state.pairsById, pairs),
    })),

  setActivities: (activities) =>
    set((state) => {
      if (activities.length === 0) return state;
      const next = { ...state.activitiesById };
      for (const row of activities) {
        next[toActivityId(row)] = row;
      }
      return { activitiesById: next };
    }),

  setLikes: (likes) =>
    set((state) => ({
      likesById: setById(state.likesById, likes),
    })),

  setQuestionnaires: (questionnaires) =>
    set((state) => ({
      questionnairesById: setById(state.questionnairesById, questionnaires),
    })),

  setMatchFeed: (key, rows) =>
    set((state) => ({
      usersById: setById(
        state.usersById,
        rows.map((row) => ({
          id: row.id,
          username: row.username,
          avatar: row.avatar,
        }))
      ),
      matchFeedByKey: {
        ...state.matchFeedByKey,
        [key]: {
          data: rows,
          updatedAt: Date.now(),
        },
      },
    })),

  setInbox: (key, rows) =>
    set((state) => ({
      usersById: setById(
        state.usersById,
        rows.map((row) => row.peer)
      ),
      inboxByKey: {
        ...state.inboxByKey,
        [key]: {
          data: rows,
          updatedAt: Date.now(),
        },
      },
    })),

  setActivitiesList: (key, rows) =>
    set((state) => {
      const nextActivities = { ...state.activitiesById };
      for (const row of rows) {
        nextActivities[toActivityId(row)] = row;
      }
      return {
        activitiesById: nextActivities,
        activitiesByKey: {
          ...state.activitiesByKey,
          [key]: {
            data: rows,
            updatedAt: Date.now(),
          },
        },
      };
    }),

  setQuestionnaireCards: (key, rows) =>
    set((state) => ({
      questionnairesById: setById(state.questionnairesById, rows),
      questionnairesByKey: {
        ...state.questionnairesByKey,
        [key]: {
          data: rows,
          updatedAt: Date.now(),
        },
      },
    })),

  setPairStatus: (key, status) =>
    set((state) => ({
      usersById:
        status.hasActive && status.peer
          ? {
              ...state.usersById,
              [status.peer.id]: status.peer,
            }
          : state.usersById,
      pairStatusByKey: {
        ...state.pairStatusByKey,
        [key]: {
          data: status,
          updatedAt: Date.now(),
        },
      },
    })),

  setPairMe: (key, pair) =>
    set((state) => ({
      pairsById:
        pair.pair && pair.pair.id
          ? {
              ...state.pairsById,
              [pair.pair.id]: pair.pair,
            }
          : state.pairsById,
      pairMeByKey: {
        ...state.pairMeByKey,
        [key]: {
          data: pair,
          updatedAt: Date.now(),
        },
      },
    })),

  setCurrentUser: (key, user) =>
    set((state) => ({
      usersById: {
        ...state.usersById,
        [user.id]: {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
        },
      },
      currentUserByKey: {
        ...state.currentUserByKey,
        [key]: {
          data: user,
          updatedAt: Date.now(),
        },
      },
    })),

  getMatchFeed: (key) => get().matchFeedByKey[key]?.data ?? null,
  getInbox: (key) => get().inboxByKey[key]?.data ?? null,
  getActivitiesList: (key) => get().activitiesByKey[key]?.data ?? null,
  getQuestionnaireCards: (key) => get().questionnairesByKey[key]?.data ?? null,
  getPairStatus: (key) => get().pairStatusByKey[key]?.data ?? null,
  getPairMe: (key) => get().pairMeByKey[key]?.data ?? null,
  getCurrentUser: (key) => get().currentUserByKey[key]?.data ?? null,
}));
