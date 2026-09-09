import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import mongoose, { Types } from "mongoose";
import { GET as getConversation, POST as updateConversation } from "@/app/api/match/connections/[id]/conversation/route";
import { MatchingConversationRound } from "@/models/MatchingConversationRound";
import { POST as blockUser } from "@/app/api/match/block/route";
import { DELETE as unblockUser } from "@/app/api/match/block/[id]/route";
import { GET as getCandidateCard } from "@/app/api/match/card/[id]/route";
import {
  GET as getOwnCard,
  POST as saveOwnCard,
} from "@/app/api/match/card/route";
import { POST as confirmConnection } from "@/app/api/match/confirm/route";
import { GET as getConnection } from "@/app/api/match/connections/[id]/route";
import { GET as getFeed } from "@/app/api/match/feed/route";
import { GET as getInbox } from "@/app/api/match/inbox/route";
import { GET as getLike } from "@/app/api/match/like/[id]/route";
import { POST as createLike } from "@/app/api/match/like/route";
import { POST as rejectLike } from "@/app/api/match/reject/route";
import {
  GET as getPreferences,
  PUT as savePreferences,
} from "@/app/api/match/preferences/route";
import { POST as respondToLike } from "@/app/api/match/respond/route";
import { GET as getOwnPair } from "@/app/api/pairs/me/route";
import { POST as createPairInvite } from "@/app/api/pair-invites/route";
import { sessionRevocationService } from "@/domain/services/sessionRevocation.service";
import { entryProfileService } from "@/domain/services/entryProfile.service";
import { usersService } from "@/domain/services/users.service";
import { mvpOnboardingService, MVP_ONBOARDING_QUESTIONS, MVP_ONBOARDING_CONTENT_REVISION, MVP_ONBOARDING_POLICY_VERSION } from "@/domain/services/mvpOnboarding.service";
import { signJwt } from "@/lib/jwt";
import { connectToDatabase } from "@/lib/mongodb";
import { privacySubjectHash } from "@/lib/privacy/subjectHash";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { EvidenceEvent } from "@/models/EvidenceEvent";
import { EventLog } from "@/models/EventLog";
import { EconomyWallet } from "@/models/EconomyWallet";
import { EconomyLedger } from "@/models/EconomyLedger";
import { IdempotencyRecord } from "@/models/IdempotencyRecord";
import { IndividualFactorSnapshot } from "@/models/IndividualFactorSnapshot";
import { Like } from "@/models/Like";
import { MatchingBlock } from "@/models/MatchingBlock";
import { MatchingConnection } from "@/models/MatchingConnection";
import { MatchingEvaluationSnapshot } from "@/models/MatchingEvaluationSnapshot";
import { MatchingFeedSession } from "@/models/MatchingFeedSession";
import { MatchingProfile } from "@/models/MatchingProfile";
import { MatchingSocialEffect } from "@/models/MatchingSocialEffect";
import { MatchingUseGrant } from "@/models/MatchingUseGrant";
import { MvpOnboardingSession } from "@/models/MvpOnboardingSession";
import { Notification } from "@/models/Notification";
import { Pair } from "@/models/Pair";
import { PairInvite } from "@/models/PairInvite";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import { PartnerPreferenceProfile } from "@/models/PartnerPreferenceProfile";
import { RateLimitBucket } from "@/models/RateLimitBucket";
import { SessionSubject } from "@/models/SessionSubject";
import { User } from "@/models/User";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type SuccessEnvelope = { ok: true; data: JsonValue };
type ErrorEnvelope = {
  ok: false;
  error: { code: string; message: string; details?: JsonValue };
};
type ApiEnvelope = SuccessEnvelope | ErrorEnvelope;

type Actor = {
  userId: string;
  token: string;
};

type CardBody = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string, string];
  boundaries: [string, string, string];
  boundaryDealbreakers: [boolean, boolean, boolean];
  ageRange: { min: number; max: number };
  maxDistanceKm: number;
  active: boolean;
  actual: {
    relationshipIntent:
      "GETTING_TO_KNOW" | "OPEN_TO_RELATIONSHIP" | "LOOKING_FOR_LONG_TERM";
    childrenIntent: "YES" | "NO" | "UNSURE";
    structurePreference: number;
    socialActivityPreference: number;
    cleaningPreference: number;
    repairSkill: number;
    relationshipPriority: number;
  };
};

const runId = `matching-http-social-${randomUUID()}`;
const userIds = {
  a: `${runId}:a`,
  b: `${runId}:b`,
  attacker: `${runId}:attacker`,
} as const;
const allUserIds = Object.values(userIds);
const jwtSecret = `${randomUUID()}${randomUUID()}`;
process.env.JWT_SECRET = jwtSecret;

const asObject = (value: JsonValue, label: string): JsonObject => {
  assert.ok(
    value !== null && !Array.isArray(value) && typeof value === "object",
    `${label} must be an object`,
  );
  return value;
};

const asArray = (value: JsonValue, label: string): JsonValue[] => {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  return value;
};

const asString = (value: JsonValue, label: string): string => {
  if (typeof value !== "string") {
    assert.fail(`${label} must be a string`);
  }
  return value;
};

const asNumber = (value: JsonValue, label: string): number => {
  if (typeof value !== "number") {
    assert.fail(`${label} must be a number`);
  }
  return value;
};

const requestFor = (input: {
  actor: Actor;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: JsonValue;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}): NextRequest => {
  const headers = new Headers({
    Authorization: `Bearer ${input.actor.token}`,
    ...input.headers,
  });
  if (input.body !== undefined) headers.set("Content-Type", "application/json");
  if (input.idempotencyKey) {
    headers.set("Idempotency-Key", input.idempotencyKey);
  }
  return new Request(`https://matching.integration.test${input.path}`, {
    method: input.method ?? "GET",
    headers,
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  }) as NextRequest;
};

const expectEnvelope = async (response: Response): Promise<ApiEnvelope> => {
  assert.match(
    response.headers.get("cache-control") ?? "",
    /private/i,
    "response must be private",
  );
  assert.match(
    response.headers.get("cache-control") ?? "",
    /no-store/i,
    "response must not be cached",
  );
  return (await response.json()) as ApiEnvelope;
};

const expectOk = async (
  response: Response,
  expectedStatus = 200,
): Promise<JsonObject> => {
  assert.equal(response.status, expectedStatus);
  const envelope = await expectEnvelope(response);
  assert.equal(envelope.ok, true);
  return asObject(envelope.data, "success data");
};

const expectError = async (
  response: Response,
  status: number,
  code: string,
): Promise<ErrorEnvelope> => {
  assert.equal(response.status, status);
  const envelope = await expectEnvelope(response);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, code);
  return envelope;
};

const mutationRequest = (
  actor: Actor,
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: JsonValue,
  idempotencyKey = randomUUID(),
): NextRequest => requestFor({ actor, path, method, body, idempotencyKey });

const cardFor = (label: string): CardBody => ({
  requirements: [
    `${label}: honest conversation`,
    `${label}: mutual respect`,
    `${label}: shared growth`,
  ],
  give: [
    `${label}: calm support`,
    `${label}: reliability`,
    `${label}: curiosity`,
  ],
  questions: [
    `${label}: what makes a good week?`,
    `${label}: how do you repair conflict?`,
    `${label}: how do you respect differences?`,
  ],
  boundaries: ["No insults", "No coercion", "No deception"],
  boundaryDealbreakers: [true, true, false],
  ageRange: { min: 18, max: 99 },
  maxDistanceKm: 100,
  active: true,
  actual: {
    relationshipIntent: "LOOKING_FOR_LONG_TERM",
    childrenIntent: "UNSURE",
    structurePreference: 0.2,
    socialActivityPreference: 0.1,
    cleaningPreference: 0.6,
    repairSkill: 0.8,
    relationshipPriority: 0.9,
  },
});

const reactions = ["give", "requirements", "boundaries"].flatMap((section) => [0, 1, 2].map((index) => ({ section, index, reaction: "AGREE" })));

const jsonCard = (card: CardBody): JsonObject => ({
  ...card,
  requirements: [...card.requirements],
  give: [...card.give],
  questions: [...card.questions],
});

const issueActor = async (userId: string): Promise<Actor> => {
  const sessionVersion =
    await sessionRevocationService.getOrCreateVersion(userId);
  return {
    userId,
    token: signJwt(userId, jwtSecret, 900, sessionVersion),
  };
};

const preferenceMutationBody = (data: JsonObject): JsonObject => {
  const preferences = asArray(data.preferences, "preferences").map(
    (entry, index): JsonObject => {
      const preference = asObject(entry, `preference ${index}`);
      return {
        factorKey: asString(preference.factorKey, "factorKey"),
        target: preference.target,
        importance: asString(preference.importance, "importance"),
        flexibility: asString(preference.flexibility, "flexibility"),
        constraintMode: asString(preference.constraintMode, "constraintMode"),
        useAllowed: true,
      };
    },
  );
  assert.ok(
    preferences.length > 0,
    "published matching preferences are required",
  );
  return {
    revision: asNumber(data.revision, "preference revision"),
    preferences,
  };
};

const configureParticipant = async (
  actor: Actor,
  card: CardBody,
  verifyRepairHistory = false,
): Promise<void> => {
  if (actor.userId === userIds.b) {
    const reportFirstCardStage = (stage: string) => process.stderr.write(`${JSON.stringify({ suite: "matching-social-flow", stage, status: "running" })}\n`);
    reportFirstCardStage("first card empty matching state");
    // Genuine first card: onboarding above was completed through its service,
    // and no matching snapshot, preference or grant was seeded for this user.
    assert.equal(await IndividualFactorSnapshot.countDocuments({ subjectId: actor.userId, projectionPurpose: "MATCHING" }), 0);
    assert.equal(await MatchingUseGrant.countDocuments({ ownerId: actor.userId }), 0);
    reportFirstCardStage("first card draft actual persistence");
    const firstCard = { ...jsonCard(card), active: false, actual: { relationshipIntent: card.actual.relationshipIntent, childrenIntent: card.actual.childrenIntent } };
    const draft = await expectOk(await saveOwnCard(mutationRequest(actor, "/api/match/card", "POST", firstCard)));
    const storedDraft = asObject(draft.card, "first draft");
    const storedActual = asObject(storedDraft.actual, "first draft actual");
    assert.equal(storedActual.relationshipIntent, card.actual.relationshipIntent);
    assert.equal(storedActual.childrenIntent, card.actual.childrenIntent);
    assert.equal(draft.requiredDataReady, false, "Actual inputs do not supply matching-use consent or desired preferences");
    assert.equal(storedDraft.active, false);
    assert.equal(await MatchingUseGrant.countDocuments({ ownerId: actor.userId }), 0, "Saving a card must not grant matching use implicitly");
    const initialPreferences = await expectOk(await getPreferences(requestFor({ actor, path: "/api/match/preferences" })));
    reportFirstCardStage("first card explicit grants");
    const requiredKeys = new Set(["lifePlans.relationship.intent", "lifePlans.family.childrenIntent"]);
    const explicitPreferences = asArray(initialPreferences.preferences, "first preferences").map((item) => {
      const preference = asObject(item, "first preference");
      assert.equal(preference.useAllowed, false, "First entry must require explicit matching-use grants");
      return { factorKey: preference.factorKey, target: preference.target, importance: preference.importance, flexibility: preference.flexibility, constraintMode: preference.constraintMode, useAllowed: requiredKeys.has(asString(preference.factorKey, "first factor key")) };
    });
    await expectOk(await savePreferences(mutationRequest(actor, "/api/match/preferences", "PUT", { revision: initialPreferences.revision, preferences: explicitPreferences })));
    reportFirstCardStage("first card ready draft inactive");
    const readyDraft = await expectOk(await getOwnCard(requestFor({ actor, path: "/api/match/card" })));
    assert.equal(readyDraft.requiredDataReady, true, "Two explicit required preferences and grants are sufficient with the two saved actual values");
    assert.equal(asObject(readyDraft.card, "ready draft").active, false, "Readiness must not publish a draft");
    const published = await expectOk(await saveOwnCard(mutationRequest(actor, "/api/match/card", "POST", { ...firstCard, active: true })));
    reportFirstCardStage("first card explicit publication");
    assert.equal(asObject(published.card, "published first card").active, true, "Explicit publication activates the genuine first card");
  }
  if (verifyRepairHistory) process.stderr.write(`${JSON.stringify({ suite: "matching-social-flow", stage: "optional repair evidence history", status: "running" })}\n`);
  await expectOk(
    await saveOwnCard(
      mutationRequest(actor, "/api/match/card", "POST", jsonCard(card)),
    ),
  );
  if (verifyRepairHistory) {
    const firstRepairSnapshot = await IndividualFactorSnapshot.findOne({
      subjectId: actor.userId,
      projectionPurpose: "MATCHING",
      factorKey: "communication.conflict.repairSkill",
    })
      .sort({ revision: -1 })
      .lean();
    assert.equal(
      firstRepairSnapshot?.status,
      "INSUFFICIENT_DATA",
      "one repairSkill observation must respect RECENCY_WEIGHTED minEvidence=2",
    );
  }
  await expectOk(
    await saveOwnCard(
      mutationRequest(actor, "/api/match/card", "POST", jsonCard(card)),
    ),
  );
  if (verifyRepairHistory) {
    const secondRepairSnapshot = await IndividualFactorSnapshot.findOne({
      subjectId: actor.userId,
      projectionPurpose: "MATCHING",
      factorKey: "communication.conflict.repairSkill",
    })
      .sort({ revision: -1 })
      .lean();
    assert.equal(
      secondRepairSnapshot?.status,
      "AVAILABLE",
      "two HTTP card saves must materialize repairSkill as AVAILABLE",
    );
    assert.ok(
      (secondRepairSnapshot?.evidenceIds.length ?? 0) >= 2,
      "repairSkill materialization must aggregate bounded MATCHING evidence history",
    );
  }
  const preferences = await expectOk(
    await getPreferences(requestFor({ actor, path: "/api/match/preferences" })),
  );
  await expectOk(
    await savePreferences(
      mutationRequest(
        actor,
        "/api/match/preferences",
        "PUT",
        preferenceMutationBody(preferences),
      ),
    ),
  );
  const ownCard = await expectOk(
    await getOwnCard(requestFor({ actor, path: "/api/match/card" })),
  );
  assert.equal(ownCard.requiredDataReady, true);
  const storedCard = asObject(ownCard.card, "own matching card");
  assert.equal(storedCard.active, true);
  const actual = asObject(storedCard.actual, "actual matching input");
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(card.actual).sort());
  for (const [key, expected] of Object.entries(card.actual)) {
    if (typeof expected === "number") assert.ok(Math.abs(asNumber(actual[key], key) - expected) < 1e-12, `${key} must preserve the configured value within floating-point precision`);
    else assert.equal(actual[key], expected);
  }
};

const feedItemFor = (data: JsonObject, userId: string): JsonObject => {
  const item = asArray(data.items, "feed items")
    .map((entry, index) => asObject(entry, `feed item ${index}`))
    .find((entry) => {
      const candidate = asObject(entry.candidate, "feed candidate");
      return candidate.id === userId;
    });
  assert.ok(item, `feed must contain ${userId}`);
  return item;
};

const assertNoSensitiveCandidateFields = (data: JsonObject): void => {
  const serialized = JSON.stringify(data);
  for (const forbidden of [
    "actual",
    "preferences",
    "useAllowed",
    "score",
    "inputHash",
    "outputHash",
  ]) {
    assert.equal(
      serialized.includes(`\"${forbidden}\"`),
      false,
      `candidate response leaked ${forbidden}`,
    );
  }
};

const ensureTransactionCapableDatabase = async (): Promise<void> => {
  const database = mongoose.connection.db;
  assert.ok(database, "matching test database connection is unavailable");
  const hello = await database.admin().command({ hello: 1 });
  const replicaSet =
    typeof hello.setName === "string" && hello.setName.length > 0;
  const sharded = hello.msg === "isdbgrid";
  assert.ok(
    replicaSet || sharded,
    "MATCHING_TEST_MONGODB_URI must target a replica set or Atlas/sharded test database",
  );
};

const ensureIndexes = async (): Promise<void> => {
  await Promise.all([
    User.createIndexes(),
    SessionSubject.createIndexes(),
    IdempotencyRecord.createIndexes(),
    RateLimitBucket.createIndexes(),
    MvpOnboardingSession.createIndexes(),
    MatchingProfile.createIndexes(),
    PartnerPreferenceProfile.createIndexes(),
    MatchingUseGrant.createIndexes(),
    CandidateDiscoveryProjection.createIndexes(),
    CandidatePresentationGrant.createIndexes(),
    MatchingEvaluationSnapshot.createIndexes(),
    MatchingFeedSession.createIndexes(),
    Like.createIndexes(),
    MatchingBlock.createIndexes(),
    MatchingConnection.createIndexes(),
    MatchingConversationRound.createIndexes(),
    MatchingSocialEffect.createIndexes(),
    Pair.createIndexes(),
    PairInvite.createIndexes(),
    PairMembershipClaim.createIndexes(),
    EvidenceEvent.createIndexes(),
    IndividualFactorSnapshot.createIndexes(),
    Notification.createIndexes(),
    EventLog.createIndexes(),
  ]);
};

const cleanup = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 1) return;
  const pairs = await Pair.find({ members: { $in: allUserIds } })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();
  const pairIds = pairs.map((pair) => pair._id);
  await Promise.all([
    Notification.deleteMany({
      $or: [
        { userId: { $in: allUserIds } },
        ...(pairIds.length > 0 ? [{ pairId: { $in: pairIds } }] : []),
      ],
    }),
    EventLog.deleteMany({ "actor.userId": { $in: allUserIds } }),
    EconomyLedger.deleteMany({ userId: { $in: allUserIds } }),
    EconomyWallet.deleteMany({ _id: { $in: allUserIds } }),
    MatchingSocialEffect.deleteMany({ participantIds: { $in: allUserIds } }),
    MatchingEvaluationSnapshot.deleteMany({
      $or: [
        { requesterId: { $in: allUserIds } },
        { candidateId: { $in: allUserIds } },
      ],
    }),
    MatchingFeedSession.deleteMany({ requesterId: { $in: allUserIds } }),
    CandidatePresentationGrant.deleteMany({
      $or: [
        { requesterId: { $in: allUserIds } },
        { candidateId: { $in: allUserIds } },
      ],
    }),
    MatchingBlock.deleteMany({
      $or: [
        { blockerId: { $in: allUserIds } },
        { blockedId: { $in: allUserIds } },
      ],
    }),
    MatchingConversationRound.deleteMany({ participantIds: { $in: allUserIds } }),
    MatchingConnection.deleteMany({ participantIds: { $in: allUserIds } }),
    Like.deleteMany({
      $or: [{ fromId: { $in: allUserIds } }, { toId: { $in: allUserIds } }],
    }),
    CandidateDiscoveryProjection.deleteMany({ userId: { $in: allUserIds } }),
    MatchingProfile.deleteMany({ userId: { $in: allUserIds } }),
    PartnerPreferenceProfile.deleteMany({ ownerId: { $in: allUserIds } }),
    MatchingUseGrant.deleteMany({ ownerId: { $in: allUserIds } }),
    EvidenceEvent.deleteMany({
      $or: [
        { actorId: { $in: allUserIds } },
        { subjectId: { $in: allUserIds } },
      ],
    }),
    IndividualFactorSnapshot.deleteMany({ subjectId: { $in: allUserIds } }),
    IdempotencyRecord.deleteMany({ userId: { $in: allUserIds } }),
    RateLimitBucket.deleteMany({
      key: { $in: allUserIds.map((userId) => `user:${userId}`) },
    }),
    MvpOnboardingSession.deleteMany({ userId: { $in: allUserIds } }),
    PairInvite.deleteMany({
      $or: [
        { creatorUserId: { $in: allUserIds } },
        { acceptedByUserId: { $in: allUserIds } },
      ],
    }),
  ]);
  await PairMembershipClaim.deleteMany({
    $or: [
      { userId: { $in: allUserIds } },
      ...(pairIds.length > 0 ? [{ pairId: { $in: pairIds } }] : []),
    ],
  });
  if (pairIds.length > 0) {
    await Pair.deleteMany({ _id: { $in: pairIds } });
  }
  await Promise.all([
    User.deleteMany({ id: { $in: allUserIds } }),
    SessionSubject.deleteMany({
      subjectKey: { $in: allUserIds.map(privacySubjectHash) },
    }),
  ]);
  assert.equal(await User.countDocuments({ id: { $in: allUserIds } }), 0);
  assert.equal(
    await MatchingProfile.countDocuments({ userId: { $in: allUserIds } }),
    0,
  );
  assert.equal(
    await PairMembershipClaim.countDocuments({ userId: { $in: allUserIds } }),
    0,
  );
};

const seedParticipants = async (): Promise<void> => {
  // Exercise the real SOLO entry and all onboarding answers before HTTP matching.
  // No completed session or legacy profile is inserted to conceal flow gaps.
  for (const [label, userId] of Object.entries(userIds)) {
    await usersService.upsertCurrentUserProfile({ currentUserId: userId, payload: {
      username: `matching-${label}`, avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
    } });
    const entry = await entryProfileService.save({ currentUserId: userId, profile: {
      cohort: "SOLO", age: 30, gender: label === "b" ? "male" : "female",
      city: "Кызылорда", locationMode: "DEVICE", coordinates: [65.51, 44.85],
    } });
    assert.equal(entry.user.entryCohort, "SOLO");
    assert.equal(entry.hasPair, false);
    await mvpOnboardingService.mutate({ currentUserId: userId, mutation: {
      action: "start", contentRevision: MVP_ONBOARDING_CONTENT_REVISION,
      policyVersion: MVP_ONBOARDING_POLICY_VERSION,
      consent: { adultConfirmed: true, voluntaryParticipationConfirmed: true, privacyAcknowledged: true },
    } });
    for (const question of MVP_ONBOARDING_QUESTIONS) {
      const value = question.optional ? { kind: "skipped" as const }
        : question.kind === "boolean" ? { kind: "boolean" as const, booleanValue: true }
          : question.kind === "multi" ? { kind: "multi" as const, optionIds: question.choices?.slice(0, question.minSelections ?? 1).map((choice) => choice.id) ?? [] }
            : { kind: "single" as const, optionId: question.choices?.[0]?.id };
      await mvpOnboardingService.mutate({ currentUserId: userId, mutation: {
        action: "answer", questionId: question.id, questionRevision: question.revision,
        capturePolicy: question.optional ? "PRIVATE" : "PAIR_MODEL_ONLY", value,
      } });
    }
    const complete = await mvpOnboardingService.mutate({ currentUserId: userId, mutation: { action: "complete" } });
    assert.equal(complete.session?.status, "completed");
    assert.equal(complete.session?.modelStatus, "MATERIALIZED");
    const reload = await entryProfileService.get(userId);
    assert.equal(reload.onboardingCompleted, true);
    assert.equal(reload.user.publicId, entry.user.publicId);
    assert.equal(await EconomyLedger.countDocuments({ userId, sourceKind: "ONBOARDING" }), 1);
  }
};

const runSocialFlow = async (): Promise<void> => {
  const [actorA, actorB, attacker] = await Promise.all([
    issueActor(userIds.a),
    issueActor(userIds.b),
    issueActor(userIds.attacker),
  ]);
  const expiredVersion = await sessionRevocationService.getOrCreateVersion(
    userIds.a,
  );
  await expectError(
    await getOwnCard(
      requestFor({
        actor: {
          userId: userIds.a,
          token: signJwt(userIds.a, jwtSecret, -60, expiredVersion),
        },
        path: "/api/match/card",
      }),
    ),
    401,
    "AUTH_INVALID_SESSION",
  );
  const cardA = cardFor("A");
  const cardB = cardFor("B");
  const cardAttacker = cardFor("Attacker");

  await expectError(
    await saveOwnCard(
      mutationRequest(actorA, "/api/match/card", "POST", {
        ...jsonCard(cardA),
        actorId: userIds.attacker,
      }),
    ),
    400,
    "VALIDATION_ERROR",
  );

  await configureParticipant(actorA, cardA, true);
  await configureParticipant(actorB, cardB);
  await configureParticipant(attacker, cardAttacker);

  // Stale discovery projections and previously issued grants must not override
  // current entry intent, a declared relationship, or active/paused membership.
  const publicationKey = randomUUID();
  await expectOk(await saveOwnCard(mutationRequest(actorB, "/api/match/card", "POST", jsonCard(cardB), publicationKey)));
  for (const mode of ["missing-entry", "existing-partner", "declared-relationship", "active", "paused", "claim"] as const) {
    const feed = await expectOk(await getFeed(requestFor({ actor: actorA, path: "/api/match/feed?limit=20" })));
    const grant = asString(feedItemFor(feed, userIds.b).candidateGrant, "pre-mode candidate grant");
    let temporaryPairId: Types.ObjectId | undefined;
    if (mode === "missing-entry") await User.updateOne({ id: userIds.b }, { $unset: { entryCohort: 1 } });
    if (mode === "existing-partner") await User.updateOne({ id: userIds.b }, { $set: { entryCohort: "EXISTING_PARTNER" } });
    if (mode === "declared-relationship") await User.updateOne({ id: userIds.b }, { $set: { "personal.relationshipStatus": "in_relationship" } });
    if (mode === "active" || mode === "paused") {
      const pair = await Pair.create({ members: [userIds.b, userIds.attacker], key: [userIds.b, userIds.attacker].sort().join("|"), status: mode });
      temporaryPairId = pair._id;
    }
    if (mode === "claim") await PairMembershipClaim.create({ userId: userIds.b, pairId: new Types.ObjectId(), pairKey: `${userIds.b}|claim-fixture` });
    try {
      await expectError(await getFeed(requestFor({ actor: actorB, path: "/api/match/feed?limit=20" })), 409, "MATCHING_SOLO_REQUIRED");
      const filtered = await expectOk(await getFeed(requestFor({ actor: actorA, path: "/api/match/feed?limit=20" })));
      assert.equal(asArray(filtered.items, "filtered matching items").some((item) => asObject(asObject(item, "item").candidate, "candidate").id === userIds.b), false, `${mode} candidate leaked into discovery`);
      await expectError(await getCandidateCard(requestFor({ actor: actorA, path: `/api/match/card/${encodeURIComponent(userIds.b)}`, headers: { "X-Candidate-Grant": grant } }), { params: Promise.resolve({ id: userIds.b }) }), 409, "CANDIDATE_GRANT_UNAVAILABLE");
      await expectError(await saveOwnCard(mutationRequest(actorB, "/api/match/card", "POST", jsonCard(cardB), publicationKey)), 409, "MATCHING_SOLO_REQUIRED");
      await expectError(await createLike(mutationRequest(actorA, "/api/match/like", "POST", { candidateId: userIds.b, candidateGrant: grant, agreements: [true, true, true], reactions, answers: ["one", "two", "three"] })), 409, "MATCHING_SOLO_REQUIRED");
    } finally {
      await User.updateOne({ id: userIds.b }, { $set: { entryCohort: "SOLO", "personal.relationshipStatus": "seeking" } });
      if (temporaryPairId) await Pair.deleteOne({ _id: temporaryPairId });
      if (mode === "claim") await PairMembershipClaim.deleteOne({ userId: userIds.b });
    }
  }
  await RateLimitBucket.deleteMany({ key: { $in: allUserIds.map((userId) => `user:${userId}`) }, route: "/api/match/*" });

  const cursorSourceFeed = await expectOk(
    await getFeed(
      requestFor({ actor: actorA, path: "/api/match/feed?limit=1" }),
    ),
  );
  const staleCursor = asString(cursorSourceFeed.nextCursor, "feed next cursor");
  await expectOk(
    await saveOwnCard(
      mutationRequest(actorA, "/api/match/card", "POST", jsonCard(cardA)),
    ),
  );
  await expectError(
    await getFeed(
      requestFor({
        actor: actorA,
        path: `/api/match/feed?limit=1&cursor=${encodeURIComponent(staleCursor)}`,
      }),
    ),
    409,
    "MATCHING_CURSOR_STALE",
  );

  await expectOk(
    await blockUser(
      mutationRequest(actorA, "/api/match/block", "POST", {
        blockedUserId: userIds.attacker,
      }),
    ),
  );
  await expectOk(
    await unblockUser(
      mutationRequest(
        actorA,
        `/api/match/block/${encodeURIComponent(userIds.attacker)}`,
        "DELETE",
      ),
      { params: Promise.resolve({ id: userIds.attacker }) },
    ),
  );
  await expectOk(
    await blockUser(
      mutationRequest(actorA, "/api/match/block", "POST", {
        blockedUserId: userIds.attacker,
      }),
    ),
  );

  const bFeedForDecline = await expectOk(
    await getFeed(
      requestFor({ actor: actorB, path: "/api/match/feed?limit=20" }),
    ),
  );
  const attackerItem = feedItemFor(bFeedForDecline, userIds.attacker);
  const declineLike = await expectOk(
    await createLike(
      mutationRequest(actorB, "/api/match/like", "POST", {
        candidateId: userIds.attacker,
        candidateGrant: asString(
          attackerItem.candidateGrant,
          "attacker candidate grant",
        ),
        agreements: [true, true, true],
        reactions,
        answers: ["Decline route answer one", "Decline route answer two", "Decline route answer three"],
      }),
    ),
  );
  const declineLikeId = asString(declineLike.id, "decline Like id");
  const declined = await expectOk(
    await rejectLike(
      mutationRequest(attacker, "/api/match/reject", "POST", {
        likeId: declineLikeId,
      }),
    ),
  );
  assert.equal(declined.status, "DECLINED");

  const firstFeed = await expectOk(
    await getFeed(
      requestFor({ actor: actorA, path: "/api/match/feed?limit=20" }),
    ),
  );
  assert.equal(typeof firstFeed.feedRevision, "string");
  const firstFeedIds = asArray(firstFeed.items, "first feed items").map(
    (entry) =>
      asString(
        asObject(asObject(entry, "feed item").candidate, "candidate").id,
        "candidate id",
      ),
  );
  assert.equal(firstFeedIds.includes(userIds.attacker), false);
  const firstBItem = feedItemFor(firstFeed, userIds.b);
  const staleGrant = asString(firstBItem.candidateGrant, "candidate grant");
  assert.ok(staleGrant.length >= 16);

  await expectError(
    await getCandidateCard(
      requestFor({
        actor: attacker,
        path: `/api/match/card/${encodeURIComponent(userIds.b)}`,
        headers: { "X-Candidate-Grant": staleGrant },
      }),
      { params: Promise.resolve({ id: userIds.b }) },
    ),
    404,
    "NOT_FOUND",
  );

  const changedCardB: CardBody = {
    ...cardB,
    requirements: [
      `${cardB.requirements[0]} updated`,
      cardB.requirements[1],
      cardB.requirements[2],
    ],
  };
  await expectOk(
    await saveOwnCard(
      mutationRequest(
        actorB,
        "/api/match/card",
        "POST",
        jsonCard(changedCardB),
      ),
    ),
  );
  await expectError(
    await getCandidateCard(
      requestFor({
        actor: actorA,
        path: `/api/match/card/${encodeURIComponent(userIds.b)}`,
        headers: { "X-Candidate-Grant": staleGrant },
      }),
      { params: Promise.resolve({ id: userIds.b }) },
    ),
    409,
    "CANDIDATE_GRANT_UNAVAILABLE",
  );

  const freshFeed = await expectOk(
    await getFeed(
      requestFor({ actor: actorA, path: "/api/match/feed?limit=20" }),
    ),
  );
  const freshBItem = feedItemFor(freshFeed, userIds.b);
  const freshGrant = asString(
    freshBItem.candidateGrant,
    "fresh candidate grant",
  );
  assert.notEqual(freshGrant, staleGrant);

  const candidateCard = await expectOk(
    await getCandidateCard(
      requestFor({
        actor: actorA,
        path: `/api/match/card/${encodeURIComponent(userIds.b)}`,
        headers: { "X-Candidate-Grant": freshGrant },
      }),
      { params: Promise.resolve({ id: userIds.b }) },
    ),
  );
  assert.equal(asObject(candidateCard.candidate, "candidate").id, userIds.b);
  assertNoSensitiveCandidateFields(candidateCard);

  const likeBody: JsonObject = {
    candidateId: userIds.b,
    candidateGrant: freshGrant,
    agreements: [true, true, true],
    reactions,
    answers: ["I value consistency", "I repair through calm conversation", "I respect differences"],
  };
  await expectError(
    await createLike(
      mutationRequest(actorA, "/api/match/like", "POST", {
        ...likeBody,
        fromId: userIds.attacker,
      }),
    ),
    400,
    "VALIDATION_ERROR",
  );

  const createLikeKey = randomUUID();
  const createdLike = await expectOk(
    await createLike(
      mutationRequest(
        actorA,
        "/api/match/like",
        "POST",
        likeBody,
        createLikeKey,
      ),
    ),
  );
  const likeId = asString(createdLike.id, "like id");
  assert.equal(createdLike.status, "SENT");
  assert.ok(Types.ObjectId.isValid(likeId));
  const replayedLike = await expectOk(
    await createLike(
      mutationRequest(
        actorA,
        "/api/match/like",
        "POST",
        likeBody,
        createLikeKey,
      ),
    ),
  );
  assert.equal(
    replayedLike.id,
    likeId,
    "network retry must replay the same Like",
  );
  assert.equal(
    await MatchingSocialEffect.countDocuments({
      name: "LIKE_CREATED",
      resourceId: likeId,
    }),
    1,
    "Like creation must persist one transactional audit effect",
  );
  assert.equal(
    await Notification.countDocuments({
      userId: userIds.b,
      type: "MATCH_LIKE_RECEIVED",
      resourceId: likeId,
    }),
    1,
    "Like creation retry must persist one recipient notification",
  );
  assert.equal(
    await EventLog.countDocuments({
      event: "MATCH_LIKE_CREATED",
      "actor.userId": userIds.a,
      "context.likeId": likeId,
    }),
    1,
    "Like creation retry must persist one canonical audit event",
  );
  assert.equal(
    await Like.countDocuments({ fromId: userIds.a, toId: userIds.b }),
    1,
    "network retry must not duplicate the Like",
  );
  assert.ok(
    await IdempotencyRecord.exists({
      userId: userIds.a,
      route: "/api/match/like",
      key: createLikeKey,
    }),
    "the exact client Idempotency-Key must reach persistence",
  );

  await expectError(
    await getLike(
      requestFor({
        actor: attacker,
        path: `/api/match/like/${encodeURIComponent(likeId)}`,
      }),
      { params: Promise.resolve({ id: likeId }) },
    ),
    404,
    "NOT_FOUND",
  );

  const inboxB = await expectOk(
    await getInbox(
      requestFor({ actor: actorB, path: "/api/match/inbox?limit=20" }),
    ),
  );
  assert.ok(
    asArray(inboxB.incoming, "incoming likes").some(
      (entry) => asObject(entry, "incoming like").id === likeId,
    ),
  );

  const viewedLike = await expectOk(
    await getLike(
      requestFor({
        actor: actorB,
        path: `/api/match/like/${encodeURIComponent(likeId)}`,
      }),
      { params: Promise.resolve({ id: likeId }) },
    ),
  );
  assert.equal(viewedLike.status, "VIEWED");
  await User.updateOne({ id: userIds.b }, { $set: { "personal.relationshipStatus": "in_relationship" } });
  await expectError(await createLike(mutationRequest(actorA, "/api/match/like", "POST", likeBody, createLikeKey)), 409, "MATCHING_SOLO_REQUIRED");
  await expectError(await respondToLike(mutationRequest(actorB, "/api/match/respond", "POST", { likeId, agreements: [true, true, true], reactions, answers: ["one", "two", "three"] })), 409, "MATCHING_SOLO_REQUIRED");
  assert.equal((await Like.findById(likeId).lean())?.status, "VIEWED", "Ineligible response changed preserved request history");
  await User.updateOne({ id: userIds.b }, { $set: { "personal.relationshipStatus": "seeking" } });
  const responseKey = randomUUID();
  const respondedLike = await expectOk(
    await respondToLike(
      mutationRequest(actorB, "/api/match/respond", "POST", {
        likeId,
        agreements: [true, true, true],
        reactions,
        answers: [
          "I also value consistency",
          "I prefer a short pause, then repair",
          "I respect a clear boundary",
        ],
      }, responseKey),
    ),
  );
  assert.equal(respondedLike.status, "MATCHED");
  const responseReplay = await expectOk(await respondToLike(mutationRequest(actorB, "/api/match/respond", "POST", { likeId, agreements: [true, true, true], reactions, answers: ["I also value consistency", "I prefer a short pause, then repair", "I respect a clear boundary"] }, responseKey)));
  assert.equal(responseReplay.connectionId, respondedLike.connectionId, "A recipient response replay does not require another sender acceptance");
  await User.updateOne({ id: userIds.a }, { $set: { entryCohort: "EXISTING_PARTNER" } });
  await expectError(await respondToLike(mutationRequest(actorB, "/api/match/respond", "POST", { likeId, agreements: [true, true, true], reactions, answers: ["I also value consistency", "I prefer a short pause, then repair", "I respect a clear boundary"] }, responseKey)), 409, "MATCHING_SOLO_REQUIRED");
  await User.updateOne({ id: userIds.a }, { $set: { entryCohort: "SOLO" } });


  const detailForA = await expectOk(
    await getLike(
      requestFor({
        actor: actorA,
        path: `/api/match/like/${encodeURIComponent(likeId)}`,
      }),
      { params: Promise.resolve({ id: likeId }) },
    ),
  );
  assert.equal(detailForA.status, "MATCHED");
  assert.equal(
    asArray(detailForA.responseAnswers, "response answers").length,
    3,
  );
  const inboxA = await expectOk(
    await getInbox(
      requestFor({ actor: actorA, path: "/api/match/inbox?limit=20" }),
    ),
  );
  assert.ok(
    asArray(inboxA.outgoing, "outgoing likes").some((entry) => {
      const outgoing = asObject(entry, "outgoing like");
      return outgoing.id === likeId && outgoing.status === "MATCHED";
    }),
    "A inbox must show the response",
  );

  const connectionId = asString(respondedLike.connectionId, "connection id");
  assert.equal(await MatchingConnection.countDocuments({ participantIds: userIds.a, status: "ACTIVE" }), 1, "Recipient acceptance creates a connection without a sender third step");
  assert.ok(Types.ObjectId.isValid(connectionId));

  await expectError(
    await getConnection(
      requestFor({
        actor: attacker,
        path: `/api/match/connections/${encodeURIComponent(connectionId)}`,
      }),
      { params: Promise.resolve({ id: connectionId }) },
    ),
    404,
    "NOT_FOUND",
  );

  const connectionForA = await expectOk(
    await getConnection(
      requestFor({
        actor: actorA,
        path: `/api/match/connections/${encodeURIComponent(connectionId)}`,
      }),
      { params: Promise.resolve({ id: connectionId }) },
    ),
  );
  assert.equal(connectionForA.stage, "MATCHED");
  const connectionForB = await expectOk(
    await getConnection(
      requestFor({
        actor: actorB,
        path: `/api/match/connections/${encodeURIComponent(connectionId)}`,
      }),
      { params: Promise.resolve({ id: connectionId }) },
    ),
  );
  assert.equal(connectionForB.stage, "MATCHED");

  // This independent protocol section starts a fresh test-only rate budget.
  // Production limits remain unchanged; the query is restricted to this run's actors.
  await RateLimitBucket.deleteMany({ key: { $in: allUserIds.map((userId) => `user:${userId}`) }, route: "/api/match/*" });
  const conversationPath = `/api/match/connections/${encodeURIComponent(connectionId)}/conversation`;
  const context = { params: Promise.resolve({ id: connectionId }) };
  await expectError(await updateConversation(mutationRequest(attacker, conversationPath, "POST", { action: "SUBMIT", topicKey: "boundaries", round: 1, text: "foreign actor", revealConsent: true }), context), 404, "NOT_FOUND");
  await expectError(await updateConversation(mutationRequest(actorA, conversationPath, "POST", { action: "SUBMIT", topicKey: "boundaries", round: 1, text: "without notice consent", revealConsent: false }), context), 400, "VALIDATION_ERROR");
  const conversationSubmitKey = randomUUID();
  const firstAnswerBody = { action: "SUBMIT", topicKey: "boundaries", round: 1, text: "owner-round-secret", revealConsent: true };
  const first = await expectOk(await updateConversation(mutationRequest(actorA, conversationPath, "POST", firstAnswerBody, conversationSubmitKey), context));
  await User.updateOne({ id: userIds.b }, { $set: { "personal.relationshipStatus": "in_relationship" } });
  await expectError(await updateConversation(mutationRequest(actorA, conversationPath, "POST", firstAnswerBody, conversationSubmitKey), context), 409, "MATCHING_SOLO_REQUIRED");
  const unavailableConversation = await expectOk(await getConversation(requestFor({ actor: actorA, path: conversationPath }), context));
  assert.equal(unavailableConversation.canWrite, false);
  await expectError(await confirmConnection(mutationRequest(actorA, "/api/match/confirm", "POST", { connectionId, action: "REQUEST" })), 409, "MATCHING_SOLO_REQUIRED");
  await User.updateOne({ id: userIds.b }, { $set: { "personal.relationshipStatus": "seeking" } });
  assert.equal(asObject(asArray(first.topics, "topics")[1], "topic").revealed, false);
  const beforeReveal = await expectOk(await getConversation(requestFor({ actor: actorB, path: conversationPath }), context));
  assert.equal(JSON.stringify(beforeReveal).includes("owner-round-secret"), false, "First answer stays hidden from partner");
  await expectError(await getConversation(requestFor({ actor: attacker, path: conversationPath }), context), 404, "NOT_FOUND");
  await expectOk(await updateConversation(mutationRequest(actorA, conversationPath, "POST", { action: "WITHDRAW", topicKey: "boundaries", round: 1 }), context));
  await expectOk(await updateConversation(mutationRequest(actorA, conversationPath, "POST", { action: "SUBMIT", topicKey: "boundaries", round: 1, text: "owner-round-revised", revealConsent: true }), context));
  const disclosed = await expectOk(await updateConversation(mutationRequest(actorB, conversationPath, "POST", { action: "SUBMIT", topicKey: "boundaries", round: 1, text: "partner-round-secret", revealConsent: true }), context));
  assert.equal(JSON.stringify(disclosed).includes("owner-round-revised"), true);
  assert.equal(JSON.stringify(disclosed).includes("partner-round-secret"), true);
  await expectError(await updateConversation(mutationRequest(actorA, conversationPath, "POST", { action: "WITHDRAW", topicKey: "boundaries", round: 1 }), context), 409, "MATCHING_REVEAL_CONFLICT");
  await expectOk(await updateConversation(mutationRequest(actorA, conversationPath, "POST", { action: "SUBMIT", topicKey: "boundaries", round: 2, text: "new-round-private", revealConsent: true }), context));
  const nextRound = await expectOk(await getConversation(requestFor({ actor: actorB, path: conversationPath }), context));
  assert.equal(JSON.stringify(nextRound).includes("new-round-private"), false);
  const paused = await expectOk(await confirmConnection(mutationRequest(actorA, "/api/match/confirm", "POST", { connectionId, action: "PAUSE" })));
  assert.equal(paused.status, "PAUSED");
  await expectError(await updateConversation(mutationRequest(actorB, conversationPath, "POST", { action: "SUBMIT", topicKey: "boundaries", round: 2, text: "paused-answer", revealConsent: true }), context), 409, "MATCHING_CONNECTION_STATE_CONFLICT");
  await expectOk(await confirmConnection(mutationRequest(actorB, "/api/match/confirm", "POST", { connectionId, action: "RESUME" })));

  const requested = await expectOk(
    await confirmConnection(
      mutationRequest(actorA, "/api/match/confirm", "POST", {
        connectionId,
        action: "REQUEST",
      }),
    ),
  );
  assert.equal(
    asObject(requested.confirmation, "confirmation").state,
    "PENDING",
  );

  const confirmationKey = randomUUID();
  const confirmed = await expectOk(
    await confirmConnection(
      mutationRequest(actorB, "/api/match/confirm", "POST", {
        connectionId,
        action: "CONFIRM",
      }, confirmationKey),
    ),
  );
  assert.equal(confirmed.stage, "COUPLE_CONFIRMED");
  assert.equal(
    asObject(confirmed.confirmation, "confirmation").state,
    "CONFIRMED",
  );
  const pairId = asString(confirmed.pairId, "pair id");
  const confirmationReplay = await expectOk(await confirmConnection(mutationRequest(actorB, "/api/match/confirm", "POST", { connectionId, action: "CONFIRM" }, confirmationKey)));
  assert.equal(confirmationReplay.pairId, pairId, "Pair confirmation replay remains accessible to an active member");
  await expectError(await updateConversation(mutationRequest(actorA, conversationPath, "POST", firstAnswerBody, conversationSubmitKey), context), 409, "MATCHING_CONNECTION_STATE_CONFLICT");

  const pairThroughHttp = await expectOk(
    await getOwnPair(requestFor({ actor: actorA, path: "/api/pairs/me" })),
  );
  assert.equal(
    asString(asObject(pairThroughHttp.pair, "HTTP pair").id, "HTTP pair id"),
    pairId,
  );
  assert.equal(pairThroughHttp.hasActive, true);
  const pairForBThroughHttp = await expectOk(
    await getOwnPair(requestFor({ actor: actorB, path: "/api/pairs/me" })),
  );
  assert.equal(
    asString(
      asObject(pairForBThroughHttp.pair, "B HTTP pair").id,
      "B HTTP pair id",
    ),
    pairId,
  );
  assert.equal(pairForBThroughHttp.hasActive, true);

  await expectError(
    await createPairInvite(
      mutationRequest(actorA, "/api/pair-invites", "POST", {}),
    ),
    409,
    "PAIR_ENTRY_REQUIRED",
  );
  assert.equal(
    await PairInvite.countDocuments({ creatorUserId: userIds.a }),
    0,
    "PairInvite must not bypass a Pair created by matching",
  );

  const [pair, claims, connection] = await Promise.all([
    Pair.findById(pairId).lean(),
    PairMembershipClaim.find({
      userId: { $in: [userIds.a, userIds.b] },
    }).lean(),
    MatchingConnection.findById(connectionId).lean(),
  ]);
  assert.ok(pair);
  assert.deepEqual([...pair.members].sort(), [userIds.a, userIds.b].sort());
  assert.equal(claims.length, 2);
  assert.ok(claims.every((claim) => String(claim.pairId) === pairId));
  assert.equal(String(connection?.pairId), pairId);
  assert.equal(connection?.stage, "COUPLE_CONFIRMED");
  await expectOk(await blockUser(mutationRequest(actorA, "/api/match/block", "POST", { blockedUserId: userIds.b })));
  await expectError(await updateConversation(mutationRequest(actorA, conversationPath, "POST", firstAnswerBody, conversationSubmitKey), context), 409, "MATCHING_BLOCKED");
  await expectError(await createLike(mutationRequest(actorA, "/api/match/like", "POST", likeBody, createLikeKey)), 409, "MATCHING_BLOCKED");
  await expectError(await respondToLike(mutationRequest(actorB, "/api/match/respond", "POST", { likeId, agreements: [true, true, true], reactions, answers: ["I also value consistency", "I prefer a short pause, then repair", "I respect a clear boundary"] }, responseKey)), 409, "MATCHING_BLOCKED");
  const blockedDetail = await expectOk(await getLike(requestFor({ actor: actorA, path: `/api/match/like/${likeId}` }), { params: Promise.resolve({ id: likeId }) }));
  assert.equal(blockedDetail.responseAnswers, undefined, "Blocked Like GET never returns private answers");

};

const main = async (): Promise<void> => {
  const target = requireMatchingTestDatabaseTarget();
  process.env.MONGODB_URI = target.uri;
  await connectToDatabase();
  try {
    await ensureTransactionCapableDatabase();
    await ensureIndexes();
    await seedParticipants();
    await runSocialFlow();
    console.log(
      JSON.stringify({
        ok: true,
        runId,
        flow: "solo-entry-onboarding-card-preferences-feed-like-connection-pair",
        security: [
          "actor-spoof-rejected",
          "foreign-grant-hidden",
          "stale-grant-rejected",
          "block-excluded",
          "resource-non-enumeration",
        ],
      }),
    );
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(
    `matching-social-flow.integration: failed (${error.name}: ${error.message})`,
  );
  process.exitCode = 1;
});
