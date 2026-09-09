import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import {
  GET as getMatchingCard,
  POST as postMatchingCard,
} from "@/app/api/match/card/route";
import {
  GET as getMatchingPreferences,
  PUT as putMatchingPreferences,
} from "@/app/api/match/preferences/route";
import { GET as getPrivacyExport } from "@/app/api/privacy/export/route";
import { POST as postDeletionRequest } from "@/app/api/privacy/deletion-request/route";
import { POST as executeDeletionRequest } from "@/app/api/privacy/deletion-request/execute/route";
import type {
  MatchingCardDTO,
  MatchingPreferencesDTO,
  SaveMatchingCardRequest,
  SaveMatchingPreferencesRequest,
} from "@/client/api/match.api";
import type { OwnerPrivacyExportDTO } from "@/domain/services/privacyExport.service";
import type { OwnerDeletionRequestDTO } from "@/domain/services/privacyRequest.service";
import { sessionRevocationService } from "@/domain/services/sessionRevocation.service";
import { signJwt } from "@/lib/jwt";
import { privacySubjectHash } from "@/lib/privacy/subjectHash";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { EvidenceEvent } from "@/models/EvidenceEvent";
import { EventLog } from "@/models/EventLog";
import { IdempotencyRecord } from "@/models/IdempotencyRecord";
import { IndividualFactorSnapshot } from "@/models/IndividualFactorSnapshot";
import { Like, type CardSnapshot } from "@/models/Like";
import { MatchingBlock } from "@/models/MatchingBlock";
import { MatchingConnection } from "@/models/MatchingConnection";
import { MatchingEvaluationSnapshot } from "@/models/MatchingEvaluationSnapshot";
import { MatchingFeedSession } from "@/models/MatchingFeedSession";
import { MatchingProfile } from "@/models/MatchingProfile";
import { MatchingSocialEffect } from "@/models/MatchingSocialEffect";
import { MatchingUseGrant } from "@/models/MatchingUseGrant";
import { MvpOnboardingSession } from "@/models/MvpOnboardingSession";
import { Pair } from "@/models/Pair";
import { PartnerPreferenceProfile } from "@/models/PartnerPreferenceProfile";
import { PrivacyRequest } from "@/models/PrivacyRequest";
import { RateLimitBucket } from "@/models/RateLimitBucket";
import { SessionSubject } from "@/models/SessionSubject";
import { User } from "@/models/User";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type DeletionResponse = {
  request: OwnerDeletionRequestDTO;
  deleted: true;
};

const target = requireMatchingTestDatabaseTarget();
process.env.MONGODB_URI = target.uri;

const runId = randomUUID();
const ownerUserId = `privacy-owner-${runId}`;
const peerUserId = `privacy-peer-${runId}`;
const userIds = [ownerUserId, peerUserId] as const;
const ownerSentinel = `owner-card-${runId}`;
const peerSentinel = `peer-private-${runId}`;
const ownerInitiatorAnswer = `owner-like-answer-${runId}`;
const peerResponseAnswer = `peer-response-answer-${runId}`;
const ownerSubjectKey = privacySubjectHash(ownerUserId);
const peerSubjectKey = privacySubjectHash(peerUserId);
const deletedOwnerSubject = `deleted:${ownerSubjectKey}`;
const deletedOwnerMongoId = new mongoose.Types.ObjectId(
  ownerSubjectKey.slice(0, 24),
);
const jwtSecret = `${randomUUID()}${randomUUID()}`;
process.env.JWT_SECRET = jwtSecret;

const makeRequest = (input: {
  path: string;
  bearerToken: string;
  method?: "GET" | "POST" | "PUT";
  body?: object;
  idempotent?: boolean;
}): NextRequest => {
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${input.bearerToken}`,
    "User-Agent": `matching-privacy-integration/${runId}`,
  });
  if (input.body) headers.set("Content-Type", "application/json");
  if (input.idempotent) headers.set("Idempotency-Key", randomUUID());
  return new NextRequest(`https://matching.integration.test${input.path}`, {
    method: input.method ?? "GET",
    headers,
    ...(input.body ? { body: JSON.stringify(input.body) } : {}),
  });
};

const readOk = async <T>(
  response: Response,
  expectedStatus = 200,
): Promise<T> => {
  const envelope = (await response.json()) as ApiEnvelope<T>;
  const context = envelope.ok ? "unexpected status" : envelope.error.code;
  assert.equal(response.status, expectedStatus, context);
  if (!envelope.ok) throw new Error(envelope.error.code);
  return envelope.data;
};

const userFixture = (
  id: string,
  username: string,
  gender: "female" | "male",
) => ({
  id,
  username,
  avatar: "matching-privacy-integration-avatar",
  entryCohort: "SOLO" as const,
  pairMembershipRevision: 0,
  personal: {
    gender,
    age: 30,
    city: "Qyzylorda",
    relationshipStatus: "seeking" as const,
  },
  preferences: {
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 500,
  },
  profile: {
    onboarding: {
      seeking: {
        valuedQualities: ["kindness", "honesty", "respect"],
        relationshipPriority: "emotional_intimacy" as const,
        minExperience: "none" as const,
        dealBreakers: "none",
        firstDateSetting: "cafe" as const,
        weeklyTimeCommitment: "5-10h" as const,
      },
    },
  },
  location: {
    type: "Point" as const,
    coordinates: [65.5092, 44.8488] as [number, number],
  },
});

const onboardingFixture = (userId: string) => {
  const now = new Date();
  return {
    userId,
    status: "completed" as const,
    contentRevision: `matching-privacy-${runId}`,
    policyVersion: "matching-privacy-integration-v1",
    consent: {
      adultConfirmed: true,
      voluntaryParticipationConfirmed: true,
      privacyAcknowledged: true,
      confirmedAt: now,
    },
    cursor: 0,
    answers: [],
    factorEngine: {
      status: "PENDING" as const,
      evidenceEventIds: [],
      individualSnapshotIds: [],
    },
    startedAt: now,
    completedAt: now,
  };
};

const cardFixture = (sentinel: string): SaveMatchingCardRequest => ({
  requirements: [sentinel, "honest communication", "mutual respect"],
  give: ["steady support", "shared curiosity", "clear boundaries"],
  questions: ["How do you repair conflict?", "What makes a home feel safe?"],
  ageRange: { min: 24, max: 42 },
  maxDistanceKm: 500,
  active: true,
  actual: {
    relationshipIntent: "LOOKING_FOR_LONG_TERM",
    childrenIntent: "UNSURE",
    structurePreference: 0.2,
    socialActivityPreference: -0.1,
    cleaningPreference: 0.7,
    repairSkill: 0.8,
    relationshipPriority: 0.9,
  },
});

const configureMatching = async (
  bearerToken: string,
  sentinel: string,
): Promise<void> => {
  const savedCard = await readOk<MatchingCardDTO>(
    await postMatchingCard(
      makeRequest({
        path: "/api/match/card",
        bearerToken,
        method: "POST",
        body: cardFixture(sentinel),
        idempotent: true,
      }),
    ),
  );
  assert.equal(savedCard.card?.requirements[0], sentinel);

  const currentPreferences = await readOk<MatchingPreferencesDTO>(
    await getMatchingPreferences(
      makeRequest({ path: "/api/match/preferences", bearerToken }),
    ),
  );
  assert.ok(currentPreferences.preferences.length > 0);
  const preferenceBody: SaveMatchingPreferencesRequest = {
    revision: currentPreferences.revision,
    preferences: currentPreferences.preferences.map((preference) => ({
      factorKey: preference.factorKey,
      target: preference.target,
      importance: preference.importance,
      flexibility: preference.flexibility,
      constraintMode: preference.constraintMode,
      useAllowed: true,
    })),
  };
  const updatedPreferences = await readOk<MatchingPreferencesDTO>(
    await putMatchingPreferences(
      makeRequest({
        path: "/api/match/preferences",
        bearerToken,
        method: "PUT",
        body: preferenceBody,
        idempotent: true,
      }),
    ),
  );
  assert.ok(
    updatedPreferences.preferences.every((preference) => preference.useAllowed),
  );

  const activeCard = await readOk<MatchingCardDTO>(
    await getMatchingCard(
      makeRequest({ path: "/api/match/card", bearerToken }),
    ),
  );
  assert.equal(activeCard.requiredDataReady, true);
  assert.equal(activeCard.card?.active, true);
};

const sortedIds = (rows: Array<{ _id: mongoose.Types.ObjectId }>): string[] =>
  rows.map((row) => row._id.toString()).sort();

const assertTransactionCapableDatabase = async (): Promise<void> => {
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

const seedSharedPairHistory = async (input: {
  database: mongoose.mongo.Db;
  ownerMongoId: mongoose.Types.ObjectId;
  peerMongoId: mongoose.Types.ObjectId;
}): Promise<{
  pairId: mongoose.Types.ObjectId;
  ownerRole: "A" | "B";
  peerRole: "A" | "B";
}> => {
  const now = new Date();
  const members = [...userIds].sort() as [string, string];
  const ownerRole = members[0] === ownerUserId ? "A" : "B";
  const peerRole = ownerRole === "A" ? "B" : "A";
  const memberObjectIds = members.map((memberId) =>
    memberId === ownerUserId ? input.ownerMongoId : input.peerMongoId,
  ) as [mongoose.Types.ObjectId, mongoose.Types.ObjectId];
  const pair = await Pair.create({
    members,
    key: members.join("|"),
    status: "active",
    contextVersion: "pair-context-v1",
    lifecycleRevision: 0,
    progress: { streak: 1, completed: 1 },
  });
  const pairId = pair._id;
  const cycleId = new mongoose.Types.ObjectId();
  const questionnaireSessionId = new mongoose.Types.ObjectId();
  const activityId = new mongoose.Types.ObjectId();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);

  await Promise.all([
    input.database.collection("pair_membership_claims").insertMany(
      members.map((userId) => ({
        userId,
        pairId,
        source: "MATCHING_CONNECTION",
        sourceId: `privacy-source-${runId}`,
        pairKey: members.join("|"),
        createdAt: now,
      })),
    ),
    input.database.collection("notifications").insertMany([
      {
        userId: ownerUserId,
        pairId,
        type: "SUMMARY_READY",
        dedupeKey: `privacy-owner-notification-${runId}`,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: peerUserId,
        pairId,
        type: "SUMMARY_READY",
        dedupeKey: `privacy-peer-notification-${runId}`,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      },
    ]),
    input.database.collection("pair_activities").insertOne({
      _id: activityId,
      pairId,
      members: memberObjectIds,
      title: { ru: "Общая история", en: "Shared history" },
      visibility: "both",
      status: "completed_success",
      lifecycleVersion: "activity-lifecycle-v3",
      feedbackSchemaVersion: "activity-feedback-v2",
      offeredAt: now,
      answers: [
        {
          checkInId: "shared-checkin",
          by: ownerRole,
          ui: 3,
          at: now,
          feedbackRevision: 1,
          captureMode: "PRIVATE",
          policyVersion: "privacy-fixture-v1",
          consentRevision: "privacy-fixture-v1",
        },
        {
          checkInId: "shared-checkin",
          by: peerRole,
          ui: 4,
          at: now,
          feedbackRevision: 1,
          captureMode: "PRIVATE",
          policyVersion: "privacy-fixture-v1",
          consentRevision: "privacy-fixture-v1",
        },
      ],
      resultSummary: {
        bothSubmitted: true,
        status: "completed_success",
        completedAt: now,
        resultVersion: "activity-result-v2",
      },
      createdAt: now,
      updatedAt: now,
    }),
    input.database.collection("pair_qn_sessions").insertOne({
      _id: questionnaireSessionId,
      pairId,
      questionnaireId: `privacy-questionnaire-${runId}`,
      members: memberObjectIds,
      startedAt: now,
      finishedAt: now,
      status: "completed",
      createdAt: now,
      updatedAt: now,
    }),
    input.database.collection("pair_qn_answers").insertMany([
      {
        sessionId: questionnaireSessionId,
        pairId,
        questionnaireId: `privacy-questionnaire-${runId}`,
        questionId: "owner-question",
        by: ownerRole,
        ui: 2,
        at: now,
      },
      {
        sessionId: questionnaireSessionId,
        pairId,
        questionnaireId: `privacy-questionnaire-${runId}`,
        questionId: "peer-question",
        by: peerRole,
        ui: 5,
        at: now,
      },
    ]),
    input.database.collection("weekly_cycles").insertOne({
      _id: cycleId,
      pairId,
      cycleKey: `privacy-cycle-${runId}`,
      startsAt: now,
      endsAt: expiresAt,
      expiresAt,
      timeZone: "UTC",
      status: "OPEN",
      memberIds: members,
      memberCompletion: members.map((userId) => ({
        userId,
        status: "SUBMITTED",
      })),
      pairReadiness: "ENOUGH",
      submissionCount: 2,
      submissionClaims: [],
      inputDefinitionVersion: "privacy-fixture-v1",
      algorithmVersion: "privacy-fixture-v1",
      createdAt: now,
      updatedAt: now,
    }),
    input.database.collection("pair_state_snapshots").insertOne({
      pairId,
      cycleId,
      cycleKey: `privacy-cycle-${runId}`,
      revision: 1,
      memberCompletion: members.map((userId) => ({
        userId,
        status: "SUBMITTED",
      })),
      dataStatus: "ENOUGH",
      reasonCodes: ["PAIR_SIGNALS_READY"],
      signals: [
        {
          key: "connection",
          status: "STEADY",
          reasonCode: "PAIR_LEVEL_STEADY",
          nextStepHint: "KEEP_CURRENT_RHYTHM",
        },
      ],
      input: {
        definitionVersion: "privacy-fixture-v1",
        evidenceRevisionIds: [],
        hash: `privacy-state-${runId}`,
        cycleStatus: "OPEN",
        timeZone: "UTC",
      },
      algorithm: { version: "privacy-fixture-v1" },
      displayVersion: "privacy-fixture-v1",
      generatedAt: now,
    }),
    input.database.collection("pair_factor_snapshots").insertOne({
      pairId: String(pairId),
      preserveMarker: runId,
    }),
    input.database.collection("pair_factor_evaluation_snapshots").insertOne({
      pairId: String(pairId),
      preserveMarker: runId,
    }),
    input.database.collection("event_logs").insertOne({
      event: "PAIR_CREATED",
      ts: now.getTime(),
      actor: { userId: peerUserId },
      context: { pairId: String(pairId) },
      target: { type: "pair", id: String(pairId) },
      request: { route: "/privacy-fixture", method: "POST" },
      metadata: { pairId: String(pairId), members },
      retentionTier: "long",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  return { pairId, ownerRole, peerRole };
};

const main = async (): Promise<void> => {
  await mongoose.connect(target.uri, {
    autoIndex: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  });
  const database = mongoose.connection.db;
  assert.ok(database, "matching test database connection is unavailable");

  try {
    await assertTransactionCapableDatabase();
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
      MatchingBlock.createIndexes(),
      MatchingConnection.createIndexes(),
      MatchingSocialEffect.createIndexes(),
      Like.createIndexes(),
      IndividualFactorSnapshot.createIndexes(),
      EvidenceEvent.createIndexes(),
      PrivacyRequest.createIndexes(),
      Pair.createIndexes(),
      EventLog.createIndexes(),
    ]);

    const [ownerUser, peerUser] = await User.create([
      userFixture(ownerUserId, `privacy-owner-${runId.slice(0, 8)}`, "female"),
      userFixture(peerUserId, `privacy-peer-${runId.slice(0, 8)}`, "male"),
    ]);
    assert.ok(ownerUser);
    assert.ok(peerUser);
    await MvpOnboardingSession.create([
      onboardingFixture(ownerUserId),
      onboardingFixture(peerUserId),
    ]);

    const [ownerVersion, peerVersion] = await Promise.all([
      sessionRevocationService.getOrCreateVersion(ownerUserId),
      sessionRevocationService.getOrCreateVersion(peerUserId),
    ]);
    const ownerToken = signJwt(ownerUserId, jwtSecret, 600, ownerVersion);
    const peerToken = signJwt(peerUserId, jwtSecret, 600, peerVersion);

    await configureMatching(ownerToken, ownerSentinel);
    await configureMatching(peerToken, peerSentinel);

    const ownerLikeCardSnapshot: CardSnapshot = {
      requirements: [ownerSentinel, "honest communication", "mutual respect"],
      give: ["steady support", "shared curiosity", "clear boundaries"],
      questions: [
        "How do you repair conflict?",
        "What makes a home feel safe?",
      ],
      updatedAt: new Date(),
    };
    await Like.create({
      fromId: ownerUserId,
      toId: peerUserId,
      status: "RESPONDED",
      revision: 2,
      interactionKey: `${ownerUserId}|${peerUserId}`,
      fromCardSnapshot: ownerLikeCardSnapshot,
      agreements: [true, false, true],
      answers: [ownerInitiatorAnswer, "owner second answer"],
      recipientResponse: {
        agreements: [false, true, false],
        answers: [peerResponseAnswer, "peer second answer"],
        initiatorCardSnapshot: ownerLikeCardSnapshot,
        at: new Date(),
      },
    });
    const sharedHistory = await seedSharedPairHistory({
      database,
      ownerMongoId: ownerUser._id,
      peerMongoId: peerUser._id,
    });

    const exportResponse = await getPrivacyExport(
      makeRequest({ path: "/api/privacy/export", bearerToken: ownerToken }),
    );
    assert.match(
      exportResponse.headers.get("cache-control") ?? "",
      /no-store/i,
    );
    const ownerExport = await readOk<OwnerPrivacyExportDTO>(exportResponse);
    assert.equal(ownerExport.scope.ownerOnlyRawData, true);
    assert.equal(
      ownerExport.matching.profile?.card.requirements[0],
      ownerSentinel,
    );
    assert.ok(ownerExport.matching.preferenceRevisions.items.length > 0);
    assert.ok(ownerExport.matching.useGrantRevisions.items.length > 0);
    assert.ok(
      ownerExport.factorEngine.individualFactorSnapshots.items.length > 0,
    );
    const initiatedInteraction = ownerExport.matchInteractions.items.find(
      (interaction) => interaction.role === "initiator",
    );
    assert.ok(initiatedInteraction);
    assert.deepEqual(initiatedInteraction.ownCardSnapshot?.give, [
      "steady support",
      "shared curiosity",
      "clear boundaries",
    ]);
    assert.deepEqual(initiatedInteraction.ownInitiatorSubmission, {
      agreements: [true, false, true],
      answers: [ownerInitiatorAnswer, "owner second answer"],
    });
    assert.equal("ownResponse" in initiatedInteraction, false);
    const serializedExport = JSON.stringify(ownerExport);
    assert.equal(serializedExport.includes(peerUserId), false);
    assert.equal(serializedExport.includes(peerSentinel), false);
    assert.equal(serializedExport.includes(peerResponseAnswer), false);
    assert.equal(serializedExport.includes('"inputHash"'), false);
    assert.equal(serializedExport.includes('"outputHash"'), false);

    const peerProfileBefore = await MatchingProfile.findOne({
      userId: peerUserId,
    })
      .select({
        _id: 1,
        publicCardRevision: 1,
        actualProfileRevision: 1,
        preferenceRevision: 1,
      })
      .lean();
    assert.ok(peerProfileBefore);
    const peerPreferenceIdsBefore = sortedIds(
      await PartnerPreferenceProfile.find({ ownerId: peerUserId })
        .select({ _id: 1 })
        .lean(),
    );
    const peerGrantIdsBefore = sortedIds(
      await MatchingUseGrant.find({ ownerId: peerUserId })
        .select({ _id: 1 })
        .lean(),
    );
    const peerSnapshotIdsBefore = sortedIds(
      await IndividualFactorSnapshot.find({ subjectId: peerUserId })
        .select({ _id: 1 })
        .lean(),
    );
    assert.ok(peerPreferenceIdsBefore.length > 0);
    assert.ok(peerGrantIdsBefore.length > 0);
    assert.ok(peerSnapshotIdsBefore.length > 0);
    const peerSessionBefore = await SessionSubject.findOne({
      subjectKey: peerSubjectKey,
    })
      .select({ _id: 1, version: 1, accountState: 1 })
      .lean();
    assert.ok(peerSessionBefore);

    const deletionRequest = await readOk<{ request: OwnerDeletionRequestDTO }>(
      await postDeletionRequest(
        makeRequest({
          path: "/api/privacy/deletion-request",
          bearerToken: ownerToken,
          method: "POST",
          body: {},
        }),
      ),
    );
    assert.equal(deletionRequest.request.status, "PENDING_CONFIRMATION");

    const executionResponse = await executeDeletionRequest(
      makeRequest({
        path: "/api/privacy/deletion-request/execute",
        bearerToken: ownerToken,
        method: "POST",
        body: { confirmation: "DELETE_ACCOUNT" },
      }),
    );
    const execution = await readOk<DeletionResponse>(executionResponse);
    assert.equal(execution.deleted, true);
    assert.equal(execution.request.status, "EXECUTED");
    assert.equal(execution.request.id, deletionRequest.request.id);
    assert.match(
      executionResponse.headers.get("set-cookie") ?? "",
      /Max-Age=0/i,
    );

    assert.equal(await User.countDocuments({ id: ownerUserId }), 0);
    assert.equal(
      await MatchingProfile.countDocuments({ userId: ownerUserId }),
      0,
    );
    assert.equal(
      await PartnerPreferenceProfile.countDocuments({ ownerId: ownerUserId }),
      0,
    );
    assert.equal(
      await MatchingUseGrant.countDocuments({ ownerId: ownerUserId }),
      0,
    );
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({ subjectId: ownerUserId }),
      0,
    );
    assert.equal(
      await EvidenceEvent.countDocuments({ subjectId: ownerUserId }),
      0,
    );
    assert.equal(
      await MvpOnboardingSession.countDocuments({ userId: ownerUserId }),
      0,
    );
    assert.equal(
      (await SessionSubject.findOne({ subjectKey: ownerSubjectKey }).lean())
        ?.accountState,
      "DELETED",
    );

    const retainedPair = await database
      .collection<{
        members: [string, string];
        key: string;
        status: string;
        endedByUserId?: string;
      }>("pairs")
      .findOne({ _id: sharedHistory.pairId });
    assert.ok(retainedPair);
    assert.equal(retainedPair.status, "ended");
    assert.equal(retainedPair.members.includes(ownerUserId), false);
    assert.equal(retainedPair.members.includes(deletedOwnerSubject), true);
    assert.equal(retainedPair.members.includes(peerUserId), true);
    assert.equal(retainedPair.key.includes(ownerUserId), false);
    assert.equal(retainedPair.endedByUserId, deletedOwnerSubject);

    assert.equal(
      await database.collection("notifications").countDocuments({
        pairId: sharedHistory.pairId,
        userId: ownerUserId,
      }),
      0,
    );
    assert.equal(
      await database.collection("notifications").countDocuments({
        pairId: sharedHistory.pairId,
        userId: peerUserId,
      }),
      1,
    );
    const retainedActivity = await database
      .collection<{
        pairId: mongoose.Types.ObjectId | string;
        members: mongoose.Types.ObjectId[];
        answers: Array<{ by: "A" | "B" }>;
      }>("pair_activities")
      .findOne({ pairId: sharedHistory.pairId });
    assert.ok(retainedActivity);
    assert.equal(
      retainedActivity.members.some((memberId) =>
        memberId.equals(ownerUser._id),
      ),
      false,
    );
    assert.equal(
      retainedActivity.members.some((memberId) =>
        memberId.equals(peerUser._id),
      ),
      true,
    );
    assert.equal(
      retainedActivity.members.some((memberId) =>
        memberId.equals(deletedOwnerMongoId),
      ),
      true,
    );
    assert.deepEqual(
      retainedActivity.answers.map((answer) => answer.by),
      [sharedHistory.peerRole],
    );

    const retainedQuestionnaireSession = await database
      .collection<{
        pairId: mongoose.Types.ObjectId | string;
        members: mongoose.Types.ObjectId[];
      }>("pair_qn_sessions")
      .findOne({ pairId: sharedHistory.pairId });
    assert.ok(retainedQuestionnaireSession);
    assert.equal(
      retainedQuestionnaireSession.members.some((memberId) =>
        memberId.equals(ownerUser._id),
      ),
      false,
    );
    assert.equal(
      retainedQuestionnaireSession.members.some((memberId) =>
        memberId.equals(peerUser._id),
      ),
      true,
    );
    const retainedQuestionnaireAnswers = await database
      .collection<{
        pairId: mongoose.Types.ObjectId | string;
        questionId: string;
        by: "A" | "B";
      }>("pair_qn_answers")
      .find({ pairId: sharedHistory.pairId })
      .toArray();
    assert.deepEqual(
      retainedQuestionnaireAnswers.map((answer) => ({
        questionId: answer.questionId,
        by: answer.by,
      })),
      [{ questionId: "peer-question", by: sharedHistory.peerRole }],
    );

    const retainedCycle = await database
      .collection<{
        pairId: mongoose.Types.ObjectId | string;
        memberIds: string[];
        memberCompletion: Array<{ userId: string }>;
        submissionClaims: Array<{ userId: string }>;
      }>("weekly_cycles")
      .findOne({ pairId: sharedHistory.pairId });
    assert.ok(retainedCycle);
    assert.equal(retainedCycle.memberIds.includes(ownerUserId), false);
    assert.equal(retainedCycle.memberIds.includes(deletedOwnerSubject), true);
    assert.equal(retainedCycle.memberIds.includes(peerUserId), true);
    assert.equal(
      retainedCycle.memberCompletion.some(
        (completion) => completion.userId === ownerUserId,
      ),
      false,
    );
    assert.equal(
      retainedCycle.memberCompletion.some(
        (completion) => completion.userId === deletedOwnerSubject,
      ),
      true,
    );
    assert.equal(
      retainedCycle.submissionClaims.some(
        (claim) => claim.userId === ownerUserId,
      ),
      false,
    );

    const retainedStateSnapshot = await database
      .collection<{
        pairId: mongoose.Types.ObjectId | string;
        memberCompletion: Array<{ userId: string }>;
      }>("pair_state_snapshots")
      .findOne({ pairId: sharedHistory.pairId });
    assert.ok(retainedStateSnapshot);
    assert.equal(
      retainedStateSnapshot.memberCompletion.some(
        (completion) => completion.userId === ownerUserId,
      ),
      false,
    );
    assert.equal(
      retainedStateSnapshot.memberCompletion.some(
        (completion) => completion.userId === deletedOwnerSubject,
      ),
      true,
    );
    assert.equal(
      await database.collection("pair_factor_snapshots").countDocuments({
        pairId: sharedHistory.pairId.toString(),
        preserveMarker: runId,
      }),
      1,
    );
    assert.equal(
      await database
        .collection("pair_factor_evaluation_snapshots")
        .countDocuments({
          pairId: sharedHistory.pairId.toString(),
          preserveMarker: runId,
        }),
      1,
    );
    assert.equal(
      await database.collection("pair_membership_claims").countDocuments({
        pairId: sharedHistory.pairId,
      }),
      0,
    );
    const retainedPairAudit = await database
      .collection<{
        actor: { userId: string };
        context: { pairId: string };
        metadata: { members: string[] };
      }>("event_logs")
      .findOne({
        "context.pairId": sharedHistory.pairId.toString(),
        "actor.userId": peerUserId,
        "metadata.members": deletedOwnerSubject,
      });
    assert.ok(retainedPairAudit);
    assert.equal(
      retainedPairAudit.metadata.members.includes(ownerUserId),
      false,
    );

    assert.equal(await User.countDocuments({ id: peerUserId }), 1);
    const peerProfileAfter = await MatchingProfile.findOne({
      userId: peerUserId,
    })
      .select({
        _id: 1,
        publicCardRevision: 1,
        actualProfileRevision: 1,
        preferenceRevision: 1,
      })
      .lean();
    assert.deepEqual(peerProfileAfter, peerProfileBefore);
    assert.deepEqual(
      sortedIds(
        await PartnerPreferenceProfile.find({ ownerId: peerUserId })
          .select({ _id: 1 })
          .lean(),
      ),
      peerPreferenceIdsBefore,
    );
    assert.deepEqual(
      sortedIds(
        await MatchingUseGrant.find({ ownerId: peerUserId })
          .select({ _id: 1 })
          .lean(),
      ),
      peerGrantIdsBefore,
    );
    assert.deepEqual(
      sortedIds(
        await IndividualFactorSnapshot.find({ subjectId: peerUserId })
          .select({ _id: 1 })
          .lean(),
      ),
      peerSnapshotIdsBefore,
    );
    const peerSessionAfter = await SessionSubject.findOne({
      subjectKey: peerSubjectKey,
    })
      .select({ _id: 1, version: 1, accountState: 1 })
      .lean();
    assert.equal(
      peerSessionAfter?._id.toString(),
      peerSessionBefore._id.toString(),
    );
    assert.equal(peerSessionAfter?.version, peerSessionBefore.version);
    assert.equal(peerSessionAfter?.accountState, "ACTIVE");

    const survivingPeerCard = await readOk<MatchingCardDTO>(
      await getMatchingCard(
        makeRequest({ path: "/api/match/card", bearerToken: peerToken }),
      ),
    );
    assert.equal(survivingPeerCard.card?.requirements[0], peerSentinel);
    assert.equal(survivingPeerCard.requiredDataReady, true);

    const peerExport = await readOk<OwnerPrivacyExportDTO>(
      await getPrivacyExport(
        makeRequest({ path: "/api/privacy/export", bearerToken: peerToken }),
      ),
    );
    assert.equal(
      peerExport.pairMemberships.items.some(
        (membership) => membership.pairId === sharedHistory.pairId.toString(),
      ),
      true,
    );
    assert.equal(
      peerExport.sharedActivities.items.some(
        (activity) => activity.pairId === sharedHistory.pairId.toString(),
      ),
      true,
    );
    assert.equal(
      peerExport.pairStateSummaries.items.some(
        (summary) => summary.pairId === sharedHistory.pairId.toString(),
      ),
      true,
    );
    assert.deepEqual(
      peerExport.pairQuestionnaireAnswers.items
        .filter((answer) => answer.pairId === sharedHistory.pairId.toString())
        .map((answer) => ({
          questionId: answer.questionId,
          role: answer.role,
        })),
      [{ questionId: "peer-question", role: sharedHistory.peerRole }],
    );
    const serializedPeerExport = JSON.stringify(peerExport);
    assert.equal(serializedPeerExport.includes(ownerUserId), false);
    assert.equal(serializedPeerExport.includes(ownerInitiatorAnswer), false);

    const storedRequest = await PrivacyRequest.findById(
      deletionRequest.request.id,
    ).lean();
    assert.equal(storedRequest?.status, "EXECUTED");
    assert.equal(storedRequest?.ownerUserId, deletedOwnerSubject);

    console.log(
      JSON.stringify({
        ok: true,
        ownerExportScoped: true,
        ownerDeletionExecuted: true,
        ownerInitiatorSubmissionExported: true,
        sharedPairHistoryPreserved: true,
        peerMatchingArtifactsPreserved: true,
        peerSessionPreserved: true,
      }),
    );
  } finally {
    const retainedPairIds = (
      await database
        .collection<{ members: string[] }>("pairs")
        .find({ members: { $in: [...userIds, deletedOwnerSubject] } })
        .project<{ _id: mongoose.Types.ObjectId }>({ _id: 1 })
        .toArray()
    ).map((pair) => pair._id);
    const retainedPairReferences: Array<mongoose.Types.ObjectId | string> = [
      ...retainedPairIds,
      ...retainedPairIds.map((pairId) => pairId.toString()),
    ];
    await Promise.all([
      database.collection("notifications").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("pair_membership_claims").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("pair_activities").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("pair_qn_sessions").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("pair_qn_answers").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("weekly_cycles").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("pair_state_snapshots").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("pair_factor_snapshots").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      database.collection("pair_factor_evaluation_snapshots").deleteMany({
        pairId: { $in: retainedPairReferences },
      }),
      Pair.deleteMany({ _id: { $in: retainedPairIds } }),
    ]);
    await Promise.all([
      Like.deleteMany({
        $or: [{ fromId: { $in: userIds } }, { toId: { $in: userIds } }],
      }),
      MatchingBlock.deleteMany({
        $or: [{ blockerId: { $in: userIds } }, { blockedId: { $in: userIds } }],
      }),
      MatchingConnection.deleteMany({ participantIds: { $in: userIds } }),
      MatchingSocialEffect.deleteMany({
        $or: [
          { actorId: { $in: userIds } },
          { participantIds: { $in: userIds } },
        ],
      }),
      MatchingEvaluationSnapshot.deleteMany({
        $or: [
          { requesterId: { $in: userIds } },
          { candidateId: { $in: userIds } },
        ],
      }),
      MatchingFeedSession.deleteMany({ requesterId: { $in: userIds } }),
      CandidatePresentationGrant.deleteMany({
        $or: [
          { requesterId: { $in: userIds } },
          { candidateId: { $in: userIds } },
        ],
      }),
      CandidateDiscoveryProjection.deleteMany({ userId: { $in: userIds } }),
      MatchingProfile.deleteMany({ userId: { $in: userIds } }),
      PartnerPreferenceProfile.deleteMany({ ownerId: { $in: userIds } }),
      MatchingUseGrant.deleteMany({ ownerId: { $in: userIds } }),
      IndividualFactorSnapshot.deleteMany({ subjectId: { $in: userIds } }),
      EvidenceEvent.deleteMany({
        $or: [
          { subjectId: { $in: userIds } },
          { actorId: { $in: userIds } },
          { observedSubjectId: { $in: userIds } },
        ],
      }),
      MvpOnboardingSession.deleteMany({ userId: { $in: userIds } }),
      IdempotencyRecord.deleteMany({ userId: { $in: userIds } }),
      RateLimitBucket.deleteMany({
        key: { $in: userIds.map((id) => `user:${id}`) },
      }),
      PrivacyRequest.deleteMany({
        ownerSubjectHash: { $in: [ownerSubjectKey, peerSubjectKey] },
      }),
      EventLog.deleteMany({
        $or: [
          { "actor.userId": { $in: [...userIds, deletedOwnerSubject] } },
          { "target.id": { $in: [...userIds, deletedOwnerSubject] } },
          { "metadata.userId": { $in: userIds } },
          {
            "context.pairId": {
              $in: retainedPairIds.map((pairId) => pairId.toString()),
            },
          },
        ],
      }),
      SessionSubject.deleteMany({
        subjectKey: { $in: [ownerSubjectKey, peerSubjectKey] },
      }),
      User.deleteMany({ id: { $in: userIds } }),
    ]);
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
