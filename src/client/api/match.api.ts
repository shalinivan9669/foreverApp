import type { MatchingAnswers, MatchingStatementReaction } from "@/lib/contracts/matchingProduct";
import { z } from "zod";
import { ApiClientError } from "./errors";
import { http, type HttpRequestOptions } from "./http";
import { toIdempotencyHeaders, type IdempotencyRequestOptions } from "./idempotency";
import type { ApiJsonValue } from "./types";

const textTuple3Schema = z.tuple([z.string(), z.string(), z.string()]);
const textTuple2Schema = z.tuple([z.string(), z.string()]);
const answerTupleSchema = z.union([textTuple3Schema, textTuple2Schema]);
const reactionSchema = z.object({ section: z.enum(["give", "requirements", "boundaries"]), index: z.number().int().min(0).max(2), reaction: z.enum(["AGREE", "NEUTRAL", "AGAINST"]), note: z.string().optional() });
const matchUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  avatar: z.string(),
  age: z.number().int().min(18).optional(),
  city: z.string().optional(),
});

const publicCardSchema = z.object({
  requirements: textTuple3Schema,
  give: textTuple3Schema.optional(),
  questions: answerTupleSchema,
  boundaries: textTuple3Schema.optional(),
  boundaryDealbreakers: z.tuple([z.boolean(), z.boolean(), z.boolean()]).optional(),
  cardVersion: z.union([z.literal(1), z.literal(2)]).optional(),
});

const relationshipIntentSchema = z.enum([
  "GETTING_TO_KNOW",
  "OPEN_TO_RELATIONSHIP",
  "LOOKING_FOR_LONG_TERM",
]);
const childrenIntentSchema = z.enum(["YES", "NO", "UNSURE"]);
const matchingActualSchema = z.object({
  relationshipIntent: relationshipIntentSchema.optional(),
  childrenIntent: childrenIntentSchema.optional(),
  structurePreference: z.number().min(-1).max(1).optional(),
  socialActivityPreference: z.number().min(-1).max(1).optional(),
  cleaningPreference: z.number().min(0).max(1).optional(),
  repairSkill: z.number().min(0).max(1).optional(),
  relationshipPriority: z.number().min(0).max(1).optional(),
});

const matchingCardFieldsSchema = publicCardSchema.extend({
  give: textTuple3Schema,
  soughtGender: z.enum(["ANY", "male", "female"]).optional(),
  ageRange: z.object({ min: z.number().int(), max: z.number().int() }),
  maxDistanceKm: z.number().int(),
  active: z.boolean(),
  actual: matchingActualSchema,
});

const matchingCardSchema = z.object({
  card: matchingCardFieldsSchema.nullable(),
  revision: z.number().int().nonnegative(),
  requiredDataReady: z.boolean(),
  missingRequiredTopics: z.array(z.string()),
});

const factorTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("SCALAR_RANGE"),
    minimum: z.number(),
    maximum: z.number(),
  }),
  z.object({
    kind: z.literal("CATEGORICAL_SET"),
    allowedValues: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("CONSTRAINT_SET"),
    allowedValues: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("ROLE_TARGET"),
    desiredPreferenceMinimum: z.number(),
    desiredPreferenceMaximum: z.number(),
  }),
]);

const matchingPreferenceSchema = z.object({
  factorKey: z.string().min(1),
  label: z.string().optional(),
  target: factorTargetSchema,
  importance: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  flexibility: z.enum(["FLEXIBLE", "PREFER", "IMPORTANT", "NON_NEGOTIABLE"]),
  constraintMode: z.enum(["NONE", "SOFT", "HARD"]),
  useAllowed: z.boolean(),
  hardAllowed: z.boolean().optional(),
});

const matchingPreferencesSchema = z.object({
  revision: z.number().int().nonnegative(),
  registryVersion: z.number().int().nonnegative(),
  preferences: z.array(matchingPreferenceSchema),
});

const matchFitSchema = z.object({
  label: z.enum(["PROMISING", "WORKABLE", "LOW_INFORMATION"]),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  explanations: z.array(z.string()).max(3),
});

const feedCandidateSchema = z.object({
  candidate: matchUserSchema,
  card: publicCardSchema,
  fit: matchFitSchema,
  candidateGrant: z.string().min(1),
});

const candidateCardSchema = z.object({
  candidate: matchUserSchema,
  card: publicCardSchema,
  fit: matchFitSchema.optional(),
});

const matchActionSchema = z.enum(["RESPOND", "ACCEPT", "DECLINE", "BLOCK", "WITHDRAW"]);
const connectionActionSchema = z.enum(["REQUEST", "CONFIRM", "CANCEL", "PAUSE", "RESUME", "CLOSE"]);

const connectionSchema: z.ZodType<MatchingConnectionDTO> = z.object({
  id: z.string().min(1),
  participant: matchUserSchema,
  stage: z.enum(["MATCHED", "TALKING", "DATING", "COUPLE_CONFIRMED"]),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED", "BLOCKED"]),
  confirmation: z.object({
    state: z.enum(["NONE", "PENDING", "CONFIRMED"]),
    requestedByMe: z.boolean(),
    confirmedByMe: z.boolean(),
    confirmedByPartner: z.boolean(),
  }),
  pairId: z.string().min(1).optional(),
  allowedActions: z.array(connectionActionSchema),
});

const likeStatusSchema = z.enum([
  "SENT",
  "VIEWED",
  "RESPONDED",
  "DECLINED",
  "WITHDRAWN",
  "EXPIRED",
  "BLOCKED",
  "MATCHED",
]);

const likeSummarySchema = z.object({
  id: z.string().min(1),
  status: likeStatusSchema,
  role: z.enum(["INITIATOR", "RECIPIENT"]),
  peer: matchUserSchema,
  allowedActions: z.array(matchActionSchema),
  connectionId: z.string().min(1).optional(),
  updatedAt: z.string().optional(),
});

const likeDetailSchema = likeSummarySchema.extend({
  card: publicCardSchema.optional(),
  questions: answerTupleSchema.optional(),
  initiatorAnswers: answerTupleSchema.optional(),
  initiatorCard: publicCardSchema.optional(),
  targetCard: publicCardSchema.optional(),
  initiatorReactions: z.array(reactionSchema).optional(),
  responseReactions: z.array(reactionSchema).optional(),
  responseAnswers: answerTupleSchema.optional(),
  connection: connectionSchema.optional(),
});

const matchingFeedSchema = z.object({
  items: z.array(feedCandidateSchema),
  nextCursor: z.string().min(1).optional(),
  feedRevision: z.string().min(1),
});

const matchingInboxSchema = z.object({
  incoming: z.array(likeSummarySchema),
  outgoing: z.array(likeSummarySchema),
  connections: z.array(connectionSchema),
  nextCursor: z.string().min(1).optional(),
});

export type MatchUserDTO = z.infer<typeof matchUserSchema>;
export type MatchPublicCardDTO = z.infer<typeof publicCardSchema>;
export type MatchingCardFields = z.infer<typeof matchingCardFieldsSchema>;
export type MatchingCardDTO = z.infer<typeof matchingCardSchema>;
export type MatchingFactorTarget = z.infer<typeof factorTargetSchema>;
export type MatchingPreferenceDTO = z.infer<typeof matchingPreferenceSchema>;
export type MatchingPreferencesDTO = z.infer<typeof matchingPreferencesSchema>;
export type MatchFitDTO = z.infer<typeof matchFitSchema>;
export type MatchFeedCandidateDTO = z.infer<typeof feedCandidateSchema>;
export type CandidateMatchingCardDTO = z.infer<typeof candidateCardSchema>;
export type MatchLikeStatus = z.infer<typeof likeStatusSchema>;
export type MatchLikeAction = z.infer<typeof matchActionSchema>;
export type MatchLikeSummaryDTO = z.infer<typeof likeSummarySchema>;
export type MatchLikeDTO = z.infer<typeof likeDetailSchema>;
export type MatchingFeedDTO = z.infer<typeof matchingFeedSchema>;
export type MatchingInboxDTO = z.infer<typeof matchingInboxSchema>;

export type MatchingConnectionDTO = {
  id: string;
  participant: MatchUserDTO;
  stage: "MATCHED" | "TALKING" | "DATING" | "COUPLE_CONFIRMED";
  status: "ACTIVE" | "PAUSED" | "CLOSED" | "BLOCKED";
  confirmation: {
    state: "NONE" | "PENDING" | "CONFIRMED";
    requestedByMe: boolean;
    confirmedByMe: boolean;
    confirmedByPartner: boolean;
  };
  pairId?: string;
  allowedActions: Array<"REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE">;
};

export type SaveMatchingCardRequest = Omit<MatchingCardFields, "actual" | "cardVersion"> & {
  actual: Omit<
    MatchingCardFields["actual"],
    "relationshipIntent" | "childrenIntent"
  > & {
    relationshipIntent: z.infer<typeof relationshipIntentSchema>;
    childrenIntent: z.infer<typeof childrenIntentSchema>;
  };
};
export type SaveMatchingPreferencesRequest = {
  revision: number;
  preferences: Array<Omit<MatchingPreferenceDTO, "label" | "hardAllowed">>;
};
export type CreateMatchingLikeRequest = {
  candidateId: string;
  candidateGrant: string;
  agreements: [true, true, true];
  answers: MatchingAnswers;
  reactions?: MatchingStatementReaction[];
};
export type RespondMatchingLikeRequest = {
  likeId: string;
  agreements: [true, true, true];
  answers: MatchingAnswers;
  reactions?: MatchingStatementReaction[];
};

const invalidPayload = (context: string, error: z.ZodError): never => {
  throw new ApiClientError({
    status: 500,
    code: "INVALID_ENVELOPE",
    message: `Invalid matching ${context} payload`,
    details: { issues: error.issues.map((issue) => issue.path.join(".")) },
  });
};

const normalize = <T>(
  schema: z.ZodType<T>,
  payload: ApiJsonValue,
  context: string,
): T => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return invalidPayload(context, parsed.error);
  return parsed.data;
};

export const normalizeMatchingCard = (payload: ApiJsonValue): MatchingCardDTO =>
  normalize(matchingCardSchema, payload, "card");

export const normalizeMatchingPreferences = (
  payload: ApiJsonValue,
): MatchingPreferencesDTO =>
  normalize(matchingPreferencesSchema, payload, "preferences");

export const normalizeMatchingFeed = (payload: ApiJsonValue): MatchingFeedDTO =>
  normalize(matchingFeedSchema, payload, "feed");

export const normalizeCandidateMatchingCard = (
  payload: ApiJsonValue,
): CandidateMatchingCardDTO =>
  normalize(candidateCardSchema, payload, "candidate card");

export const normalizeMatchingInbox = (
  payload: ApiJsonValue,
): MatchingInboxDTO => normalize(matchingInboxSchema, payload, "inbox");

export const normalizeMatchingLike = (payload: ApiJsonValue): MatchLikeDTO =>
  normalize(likeDetailSchema, payload, "like");

export const normalizeMatchingConnection = (
  payload: ApiJsonValue,
): MatchingConnectionDTO => normalize(connectionSchema, payload, "connection");

const noStore = (signal?: AbortSignal): HttpRequestOptions => ({
  ...(signal ? { signal } : {}),
  cache: "no-store",
});

const pageQuery = (cursor?: string, limit = 20): string => {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return query.toString();
};

export const matchApi = {
  async getOwnCard(signal?: AbortSignal): Promise<MatchingCardDTO> {
    return normalizeMatchingCard(
      await http.get<ApiJsonValue>("/api/match/card", noStore(signal)),
    );
  },

  async saveOwnCard(card: SaveMatchingCardRequest): Promise<MatchingCardDTO> {
    return normalizeMatchingCard(
      await http.post<ApiJsonValue, SaveMatchingCardRequest>(
        "/api/match/card",
        card,
        { idempotency: true },
      ),
    );
  },

  async getCandidateCard(
    candidateId: string,
    candidateGrant: string,
    signal?: AbortSignal,
  ): Promise<CandidateMatchingCardDTO> {
    return normalizeCandidateMatchingCard(
      await http.get<ApiJsonValue>(
        `/api/match/card/${encodeURIComponent(candidateId)}`,
        {
          ...noStore(signal),
          headers: { "X-Candidate-Grant": candidateGrant },
        },
      ),
    );
  },

  async getPreferences(signal?: AbortSignal): Promise<MatchingPreferencesDTO> {
    return normalizeMatchingPreferences(
      await http.get<ApiJsonValue>("/api/match/preferences", noStore(signal)),
    );
  },

  async updatePreferences(
    input: SaveMatchingPreferencesRequest,
  ): Promise<MatchingPreferencesDTO> {
    return normalizeMatchingPreferences(
      await http.put<ApiJsonValue, SaveMatchingPreferencesRequest>(
        "/api/match/preferences",
        input,
        { idempotency: true },
      ),
    );
  },

  async getFeed(
    cursor?: string,
    limit = 20,
    signal?: AbortSignal,
  ): Promise<MatchingFeedDTO> {
    return normalizeMatchingFeed(
      await http.get<ApiJsonValue>(
        `/api/match/feed?${pageQuery(cursor, limit)}`,
        noStore(signal),
      ),
    );
  },

  async getInbox(
    cursor?: string,
    limit = 20,
    signal?: AbortSignal,
  ): Promise<MatchingInboxDTO> {
    return normalizeMatchingInbox(
      await http.get<ApiJsonValue>(
        `/api/match/inbox?${pageQuery(cursor, limit)}`,
        noStore(signal),
      ),
    );
  },

  async getLike(likeId: string, signal?: AbortSignal): Promise<MatchLikeDTO> {
    return normalizeMatchingLike(
      await http.get<ApiJsonValue>(
        `/api/match/like/${encodeURIComponent(likeId)}`,
        noStore(signal),
      ),
    );
  },

  async createLike(input: CreateMatchingLikeRequest, options?: IdempotencyRequestOptions): Promise<MatchLikeDTO> {
    return normalizeMatchingLike(
      await http.post<ApiJsonValue, CreateMatchingLikeRequest>(
        "/api/match/like",
        input,
        { idempotency: true, headers: toIdempotencyHeaders(options) },
      ),
    );
  },

  async respond(input: RespondMatchingLikeRequest, options?: IdempotencyRequestOptions): Promise<MatchLikeDTO> {
    return normalizeMatchingLike(
      await http.post<ApiJsonValue, RespondMatchingLikeRequest>(
        "/api/match/respond",
        input,
        { idempotency: true, headers: toIdempotencyHeaders(options) },
      ),
    );
  },

  async accept(likeId: string): Promise<MatchLikeDTO> {
    return normalizeMatchingLike(
      await http.post<ApiJsonValue, { likeId: string }>(
        "/api/match/accept",
        { likeId },
        { idempotency: true },
      ),
    );
  },

  async withdraw(likeId: string): Promise<MatchLikeDTO> {
    return normalizeMatchingLike(
      await http.post<ApiJsonValue, { likeId: string }>(
        "/api/match/withdraw",
        { likeId },
        { idempotency: true },
      ),
    );
  },

  async reject(likeId: string): Promise<MatchLikeDTO> {
    return normalizeMatchingLike(
      await http.post<ApiJsonValue, { likeId: string }>(
        "/api/match/reject",
        { likeId },
        { idempotency: true },
      ),
    );
  },

  async block(blockedUserId: string): Promise<{ blocked: true }> {
    normalize(
      z.object({}),
      await http.post<ApiJsonValue, { blockedUserId: string }>(
        "/api/match/block",
        { blockedUserId },
        { idempotency: true },
      ),
      "block",
    );
    return { blocked: true };
  },

  async unblock(blockedUserId: string): Promise<{ blocked: false }> {
    normalize(
      z.object({}),
      await http.delete<ApiJsonValue>(
        `/api/match/block/${encodeURIComponent(blockedUserId)}`,
        { idempotency: true },
      ),
      "unblock",
    );
    return { blocked: false };
  },

  async getConnection(
    connectionId: string,
    signal?: AbortSignal,
  ): Promise<MatchingConnectionDTO> {
    return normalizeMatchingConnection(
      await http.get<ApiJsonValue>(
        `/api/match/connections/${encodeURIComponent(connectionId)}`,
        noStore(signal),
      ),
    );
  },

  async confirmConnection(
    connectionId: string,
    action: "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE",
    options?: IdempotencyRequestOptions,
  ): Promise<MatchingConnectionDTO> {
    return normalizeMatchingConnection(
      await http.post<
        ApiJsonValue,
        { connectionId: string; action: "REQUEST" | "CONFIRM" | "CANCEL" | "PAUSE" | "RESUME" | "CLOSE" }
      >("/api/match/confirm", { connectionId, action }, { idempotency: true, headers: toIdempotencyHeaders(options) }),
    );
  },
};
