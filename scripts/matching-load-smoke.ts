import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import mongoose, { type Collection } from "mongoose";
import { DomainError } from "@/domain/errors";
import { MVP_FACTOR_REGISTRY } from "@/domain/model/definitions/mvpDefinitions";
import { MATCHING_PRE_RANKING_POOL_LIMIT } from "@/domain/services/matching/intelligence";
import {
  createMatchingLike,
  getCandidateMatchingCard,
  getMatchingFeed,
  getMatchingInbox,
  getMatchingPreferences,
  updateMatchingPreferences,
  type MatchingPreferenceTransport,
} from "@/domain/services/matching/matchingApplication.service";
import { saveMatchingProfile } from "@/domain/services/matching/matchingProfileRuntime.service";
import { connectToDatabase } from "@/lib/mongodb";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { EventLog } from "@/models/EventLog";
import { EvidenceEvent } from "@/models/EvidenceEvent";
import { IndividualFactorSnapshot } from "@/models/IndividualFactorSnapshot";
import { Like } from "@/models/Like";
import { MatchingBlock } from "@/models/MatchingBlock";
import { MatchingConnection } from "@/models/MatchingConnection";
import { MatchingEvaluationSnapshot } from "@/models/MatchingEvaluationSnapshot";
import { MatchingFeedSession } from "@/models/MatchingFeedSession";
import { MatchingProfile } from "@/models/MatchingProfile";
import { MatchingSocialEffect } from "@/models/MatchingSocialEffect";
import { MatchingUseGrant } from "@/models/MatchingUseGrant";
import { Notification } from "@/models/Notification";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import { PartnerPreferenceProfile } from "@/models/PartnerPreferenceProfile";
import { User } from "@/models/User";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";
import { matchingReleaseTestSupport } from "./verify-matching-release";

const CANDIDATE_PROJECTION_COUNT = 10_000;
const FULL_CANDIDATE_COUNT = 40;
const PAGE_SIZE = 20;
const PRESELECTION_LIMIT = MATCHING_PRE_RANKING_POOL_LIMIT;
const FEED_SAMPLES = 24;
const INBOX_SAMPLES = 24;
const CONFIGURATION_CONCURRENCY = 6;
const INSERT_BATCH_SIZE = 1_000;
const P95_BUDGET_MS = {
  feedRanking: 1_000,
  inbox: 500,
  candidateCard: 500,
  socialMutation: 750,
} as const;
const FEED_P99_BUDGET_MS = 2_000;
const FORBIDDEN_DISCLOSURE_KEYS = [
  "actual",
  "preferences",
  "useAllowed",
  "rankingScore",
  "requesterFit",
  "candidateFit",
  "mutualFit",
  "registryHash",
  "inputHash",
  "outputHash",
] as const;

assert.equal(PRESELECTION_LIMIT, 200, "matching preselection contract changed");
assert.ok(FULL_CANDIDATE_COUNT >= PAGE_SIZE * 2);

const runId = `matching-load-${randomUUID()}`;
const requesterId = `${runId}-requester`;
const attackerId = `${runId}-attacker`;
const fullCandidateIds = Array.from(
  { length: FULL_CANDIDATE_COUNT },
  (_, index) => `${runId}-candidate-${String(index).padStart(3, "0")}`,
);
const fullOwnerIds = [requesterId, ...fullCandidateIds];
const fixtureUserIds = [...fullOwnerIds, attackerId];
const seedDigest = createHash("sha256").update(runId).digest("hex");
const baseLongitude =
  -140 + (Number.parseInt(seedDigest.slice(0, 8), 16) / 0xffffffff) * 280;
const baseLatitude = -70;

type TopologyLabel = "ATLAS_REPLICA_SET" | "ATLAS_SHARDED";

type DurationSummary = {
  samples: number;
  p95Ms: number;
  p99Ms: number;
};

type QueryPlanSummary = {
  returned: number;
  examinedDocuments: number;
  examinedKeys: number;
  geoIndexUsed: true;
  collscanStages: 0;
};

type QueryBatchSummary = {
  totalReadCommands: number;
  factorSnapshotReadCommands: number;
  preferenceReadCommands: number;
  purposeGrantReadCommands: number;
};

type SuccessfulReport = {
  ok: true;
  gate: "FACTOR_MATCHING_LOAD_SMOKE";
  topology: TopologyLabel;
  fixtures: {
    candidateProjections: number;
    rankedCandidates: number;
    pageSize: number;
    preselectionLimit: number;
  };
  discoveryQuery: QueryPlanSummary;
  batching: QueryBatchSummary;
  performance: {
    feedRanking: DurationSummary & { p95BudgetMs: number; p99BudgetMs: number };
    inbox: DurationSummary & { p95BudgetMs: number };
    candidateCard: DurationSummary & { p95BudgetMs: number };
    socialMutation: DurationSummary & { p95BudgetMs: number };
  };
  invariants: {
    stablePagination: true;
    unexpected5xx: 0;
    duplicateViolations: 0;
    crossUserDisclosure: 0;
    cleanupVerified: true;
  };
};

const hash = (...parts: readonly string[]): string =>
  createHash("sha256").update(parts.join("|")).digest("hex");

const roundMs = (value: number): number => Math.round(value * 100) / 100;

const percentile = (
  durations: readonly number[],
  percentileValue: number,
): number => {
  assert.ok(durations.length > 0, "duration sample is required");
  const ordered = [...durations].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * percentileValue) - 1);
  return roundMs(ordered[index] ?? 0);
};

const summarizeDurations = (durations: readonly number[]): DurationSummary => ({
  samples: durations.length,
  p95Ms: percentile(durations, 0.95),
  p99Ms: percentile(durations, 0.99),
});

const timed = async <T>(
  durations: number[],
  operation: () => Promise<T>,
): Promise<T> => {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    durations.push(performance.now() - startedAt);
  }
};

const assertNoPrivateMatchingData = (value: object): void => {
  const serialized = JSON.stringify(value);
  for (const key of FORBIDDEN_DISCLOSURE_KEYS) {
    assert.equal(
      serialized.includes(`\"${key}\"`),
      false,
      "matching response disclosed a forbidden field",
    );
  }
};

const userFixture = (input: {
  userId: string;
  label: string;
  location: [number, number];
  gender: "male" | "female";
}) => ({
  id: input.userId,
  username: `load-${input.label}`,
  avatar: "matching-load-smoke-avatar",
  pairMembershipRevision: 0,
  personal: {
    gender: input.gender,
    age: 30,
    city: `matching-load-${seedDigest.slice(0, 10)}`,
    relationshipStatus: "seeking" as const,
  },
  preferences: {
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 50,
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
  location: { type: "Point" as const, coordinates: input.location },
});

const cardFixture = (label: string) => ({
  requirements: [
    `${label}: honest conversation`,
    `${label}: mutual respect`,
    `${label}: shared growth`,
  ] as [string, string, string],
  give: [
    `${label}: calm support`,
    `${label}: reliability`,
    `${label}: curiosity`,
  ] as [string, string, string],
  questions: [
    `${label}: what makes a good week?`,
    `${label}: how do you repair conflict?`,
  ] as [string, string],
});

const actualFixture = {
  relationshipIntent: "LOOKING_FOR_LONG_TERM" as const,
  childrenIntent: "UNSURE" as const,
  structurePreference: 0.2,
  socialActivityPreference: 0.1,
  cleaningPreference: 0.6,
  repairSkill: 0.8,
  relationshipPriority: 0.9,
};

const auditRequest = {
  route: "/release/matching-load-smoke",
  method: "POST",
};

const assertIndexes = async (
  collection: Collection,
  requiredNames: readonly string[],
): Promise<void> => {
  const names = new Set(
    (await collection.indexes()).flatMap((index) =>
      typeof index.name === "string" ? [index.name] : [],
    ),
  );
  for (const name of requiredNames) {
    assert.ok(names.has(name), "required matching load index is missing");
  }
};

const assertRequiredIndexes = async (): Promise<void> => {
  await assertIndexes(CandidateDiscoveryProjection.collection, [
    "candidate_discovery_user",
    "candidate_discovery_location",
  ]);
  await assertIndexes(MatchingProfile.collection, ["matching_profile_user"]);
  await assertIndexes(IndividualFactorSnapshot.collection, [
    "owner_factor_profile_latest",
  ]);
  await assertIndexes(MatchingUseGrant.collection, [
    "matching_use_grant_latest",
  ]);
  await assertIndexes(MatchingEvaluationSnapshot.collection, [
    "matching_evaluation_input",
  ]);
  await assertIndexes(CandidatePresentationGrant.collection, [
    "candidate_grant_requester_candidate",
  ]);
  await assertIndexes(MatchingFeedSession.collection, [
    "matching_feed_session_requester",
  ]);
  await assertIndexes(Like.collection, ["fromId_1", "toId_1"]);
};

const requireAtlasTopology = async (): Promise<TopologyLabel> => {
  const target = requireMatchingTestDatabaseTarget();
  const configuredHosts = matchingReleaseTestSupport.configuredMongoHosts(
    target.uri,
  );
  if (
    configuredHosts.length === 0 ||
    configuredHosts.some(
      (host) =>
        !host
          .trim()
          .toLowerCase()
          .replace(/:\d+$/, "")
          .endsWith(".mongodb.net"),
    )
  ) {
    throw new Error("MATCHING_LOAD_SMOKE_ATLAS_REQUIRED");
  }
  process.env.MONGODB_URI = target.uri;
  await connectToDatabase();
  const database = mongoose.connection.db;
  if (!database) throw new Error("MATCHING_LOAD_SMOKE_DATABASE_UNAVAILABLE");
  const hello = await database.admin().command({ hello: 1 });
  if (!matchingReleaseTestSupport.hasAtlasTopologyEvidence(target.uri, hello)) {
    throw new Error("MATCHING_LOAD_SMOKE_ATLAS_EVIDENCE_UNAVAILABLE");
  }
  if (hello.msg === "isdbgrid") return "ATLAS_SHARDED";
  if (typeof hello.setName === "string" && hello.setName.length > 0) {
    return "ATLAS_REPLICA_SET";
  }
  throw new Error("MATCHING_LOAD_SMOKE_TRANSACTION_TOPOLOGY_REQUIRED");
};

const runBounded = async <T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<void>,
): Promise<void> => {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(values.length, concurrency) },
    async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= values.length) return;
        await operation(values[index] as T, index);
      }
    },
  );
  await Promise.all(workers);
};

const configureOwner = async (
  ownerId: string,
  label: string,
): Promise<void> => {
  const card = cardFixture(label);
  for (let revision = 1; revision <= 2; revision += 1) {
    await saveMatchingProfile({
      ownerId,
      card,
      actual: actualFixture,
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 50,
      discoveryRequested: true,
      operationKey: `${runId}:card:${label}:${revision}`,
    });
  }
  const preferenceView = await getMatchingPreferences({
    currentUserId: ownerId,
  });
  const preferences: MatchingPreferenceTransport[] =
    preferenceView.preferences.map((preference) => ({
      ...preference,
      target:
        preference.target.kind === "CATEGORICAL_SET" ||
        preference.target.kind === "CONSTRAINT_SET"
          ? {
              kind: preference.target.kind,
              allowedValues: [...preference.target.allowedValues],
            }
          : { ...preference.target },
      useAllowed: true,
    }));
  await updateMatchingPreferences({
    currentUserId: ownerId,
    revision: preferenceView.revision,
    preferences,
    idempotencyKey: `${runId}:preferences:${label}`,
    auditRequest,
  });
};

const seedFullParticipants = async (): Promise<void> => {
  const requesterLocation: [number, number] = [baseLongitude, baseLatitude];
  await User.insertMany([
    userFixture({
      userId: requesterId,
      label: "requester",
      location: requesterLocation,
      gender: "female",
    }),
    ...fullCandidateIds.map((userId, index) =>
      userFixture({
        userId,
        label: `candidate-${index}`,
        location: [baseLongitude + (index + 1) * 0.00005, baseLatitude],
        gender: "male",
      }),
    ),
    userFixture({
      userId: attackerId,
      label: "attacker",
      location: [baseLongitude + 0.001, baseLatitude + 0.001],
      gender: "female",
    }),
  ]);

  await configureOwner(requesterId, "requester");
  await runBounded(
    fullCandidateIds,
    CONFIGURATION_CONCURRENCY,
    async (ownerId, index) => configureOwner(ownerId, `candidate-${index}`),
  );

  await Promise.all([
    MatchingProfile.updateMany(
      { userId: { $in: fullOwnerIds } },
      { $set: { runId } },
    ),
    CandidateDiscoveryProjection.updateMany(
      { userId: { $in: fullOwnerIds } },
      { $set: { runId } },
    ),
    PartnerPreferenceProfile.updateMany(
      { ownerId: { $in: fullOwnerIds } },
      { $set: { runId } },
    ),
    MatchingUseGrant.updateMany(
      { ownerId: { $in: fullOwnerIds } },
      { $set: { runId } },
    ),
  ]);

  assert.equal(
    await MatchingProfile.countDocuments({
      userId: { $in: fullOwnerIds },
      active: true,
      requiredDataReady: true,
    }),
    fullOwnerIds.length,
    "full matching fixtures must be active and ready",
  );
};

const seedScaleProjections = async (): Promise<void> => {
  const scaleOnlyCount = CANDIDATE_PROJECTION_COUNT - FULL_CANDIDATE_COUNT;
  for (let offset = 0; offset < scaleOnlyCount; offset += INSERT_BATCH_SIZE) {
    const batchSize = Math.min(INSERT_BATCH_SIZE, scaleOnlyCount - offset);
    const rows = Array.from({ length: batchSize }, (_, localIndex) => {
      const index = offset + localIndex;
      const userId = `${runId}-projection-${String(index).padStart(5, "0")}`;
      const longitudeOffset = 0.05 + (index % 4_980) * 0.00005;
      const latitudeOffset = Math.floor(index / 4_980) * 0.01;
      return {
        userId,
        active: true,
        requiredDataReady: true,
        age: 30,
        city: `matching-load-${seedDigest.slice(0, 10)}`,
        location: {
          type: "Point" as const,
          coordinates: [
            baseLongitude + longitudeOffset,
            baseLatitude + latitudeOffset,
          ] as [number, number],
        },
        relationshipIntent: "SEEKING_RELATIONSHIP" as const,
        publicCardRevision: 1,
        actualProfileRevision: 1,
        preferenceRevision: 0,
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
        projectionHash: hash(runId, "projection", userId),
        runId,
      };
    });
    await CandidateDiscoveryProjection.insertMany(rows, { ordered: true });
  }
  assert.equal(
    await CandidateDiscoveryProjection.countDocuments({
      runId,
      userId: { $ne: requesterId },
    }),
    CANDIDATE_PROJECTION_COUNT,
    "matching load fixture requires at least 10,000 candidate projections",
  );
};

const explainDiscoveryQuery = async (): Promise<QueryPlanSummary> => {
  const explanation = await CandidateDiscoveryProjection.collection
    .find({
      userId: { $ne: requesterId },
      active: true,
      requiredDataReady: true,
      relationshipIntent: "SEEKING_RELATIONSHIP",
      age: { $gte: 18, $lte: 99 },
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [baseLongitude, baseLatitude],
          },
          $maxDistance: 50_000,
        },
      },
    })
    .limit(PRESELECTION_LIMIT)
    .explain("executionStats");
  const serialized = JSON.stringify(explanation);
  const collscanStages = (serialized.match(/\"stage\":\"COLLSCAN\"/g) ?? [])
    .length;
  assert.equal(collscanStages, 0, "discovery query used COLLSCAN");
  assert.ok(
    serialized.includes("candidate_discovery_location") ||
      serialized.includes("GEO_NEAR_2DSPHERE"),
    "discovery query did not use the geospatial index",
  );
  const executionStats = explanation.executionStats;
  assert.ok(executionStats, "discovery explain lacks execution stats");
  assert.equal(
    executionStats.nReturned,
    PRESELECTION_LIMIT,
    "discovery explain did not return the bounded preselection",
  );
  assert.ok(executionStats.nReturned <= PRESELECTION_LIMIT);
  assert.ok(
    Number.isInteger(executionStats.totalDocsExamined) &&
      executionStats.totalDocsExamined >= 0,
  );
  assert.ok(
    Number.isInteger(executionStats.totalKeysExamined) &&
      executionStats.totalKeysExamined >= 0,
  );
  return {
    returned: executionStats.nReturned,
    examinedDocuments: executionStats.totalDocsExamined,
    examinedKeys: executionStats.totalKeysExamined,
    geoIndexUsed: true,
    collscanStages: 0,
  };
};

const candidateIdsFromFeed = (
  feed: Awaited<ReturnType<typeof getMatchingFeed>>,
): string[] => feed.items.map((item) => item.candidate.id);

const captureBatchedFeed = async (): Promise<{
  feed: Awaited<ReturnType<typeof getMatchingFeed>>;
  batching: QueryBatchSummary;
}> => {
  const reads = new Map<string, number>();
  mongoose.set("debug", (collectionName: string, methodName: string) => {
    if (
      !["aggregate", "countDocuments", "find", "findOne"].includes(methodName)
    ) {
      return;
    }
    reads.set(collectionName, (reads.get(collectionName) ?? 0) + 1);
  });
  try {
    const feed = await getMatchingFeed({
      currentUserId: requesterId,
      limit: PAGE_SIZE,
    });
    const factorSnapshotReadCommands =
      reads.get(IndividualFactorSnapshot.collection.collectionName) ?? 0;
    const preferenceReadCommands =
      reads.get(PartnerPreferenceProfile.collection.collectionName) ?? 0;
    const purposeGrantReadCommands =
      reads.get(MatchingUseGrant.collection.collectionName) ?? 0;
    const totalReadCommands = [...reads.values()].reduce(
      (total, count) => total + count,
      0,
    );
    for (const count of [
      factorSnapshotReadCommands,
      preferenceReadCommands,
      purposeGrantReadCommands,
    ]) {
      assert.ok(
        count >= 1 && count <= 2,
        "matching ranking introduced an N+1 read",
      );
    }
    assert.ok(
      totalReadCommands <= 50,
      "matching feed read command count is not bounded",
    );
    return {
      feed,
      batching: {
        totalReadCommands,
        factorSnapshotReadCommands,
        preferenceReadCommands,
        purposeGrantReadCommands,
      },
    };
  } finally {
    mongoose.set("debug", false);
  }
};

const assertStablePagination = async (
  firstPage: Awaited<ReturnType<typeof getMatchingFeed>>,
): Promise<number> => {
  assert.equal(firstPage.items.length, PAGE_SIZE);
  assert.ok(
    firstPage.nextCursor,
    "two-page matching fixture requires a cursor",
  );
  const firstIds = candidateIdsFromFeed(firstPage);
  assert.equal(new Set(firstIds).size, firstIds.length);
  const secondPage = await getMatchingFeed({
    currentUserId: requesterId,
    cursor: firstPage.nextCursor,
    limit: PAGE_SIZE,
  });
  const replayedSecondPage = await getMatchingFeed({
    currentUserId: requesterId,
    cursor: firstPage.nextCursor,
    limit: PAGE_SIZE,
  });
  const secondIds = candidateIdsFromFeed(secondPage);
  assert.deepEqual(candidateIdsFromFeed(replayedSecondPage), secondIds);
  assert.equal(secondIds.length, PAGE_SIZE);
  assert.equal(new Set(secondIds).size, secondIds.length);
  assert.equal(
    firstIds.filter((candidateId) => secondIds.includes(candidateId)).length,
    0,
  );
  const session = await MatchingFeedSession.findOne({ requesterId })
    .sort({ createdAt: -1 })
    .select({ candidateIds: 1 })
    .lean<{ candidateIds: string[] } | null>();
  assert.ok(session);
  assert.ok(session.candidateIds.length <= PRESELECTION_LIMIT);
  assert.equal(new Set(session.candidateIds).size, session.candidateIds.length);
  return session.candidateIds.length;
};

const runMeasuredPaths = async (
  capturedFeed: Awaited<ReturnType<typeof getMatchingFeed>>,
): Promise<{
  feed: DurationSummary;
  card: DurationSummary;
  mutation: DurationSummary;
  inbox: DurationSummary;
}> => {
  assertNoPrivateMatchingData(capturedFeed);
  const feedDurations: number[] = [];
  let mutationFeed = capturedFeed;
  for (let sample = 0; sample < FEED_SAMPLES; sample += 1) {
    mutationFeed = await timed(feedDurations, () =>
      getMatchingFeed({ currentUserId: requesterId, limit: PAGE_SIZE }),
    );
    assert.equal(mutationFeed.items.length, PAGE_SIZE);
    assert.equal(
      new Set(candidateIdsFromFeed(mutationFeed)).size,
      mutationFeed.items.length,
    );
    assertNoPrivateMatchingData(mutationFeed);
  }

  const cardDurations: number[] = [];
  for (const item of mutationFeed.items) {
    const card = await timed(cardDurations, () =>
      getCandidateMatchingCard({
        currentUserId: requesterId,
        candidateId: item.candidate.id,
        candidateGrant: item.candidateGrant,
      }),
    );
    assertNoPrivateMatchingData(card);
  }

  let attackerDenied = false;
  const firstItem = mutationFeed.items[0];
  assert.ok(firstItem);
  try {
    await getCandidateMatchingCard({
      currentUserId: attackerId,
      candidateId: firstItem.candidate.id,
      candidateGrant: firstItem.candidateGrant,
    });
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) {
      attackerDenied = true;
    } else {
      throw error;
    }
  }
  assert.equal(
    attackerDenied,
    true,
    "foreign candidate grant disclosed a card",
  );

  const mutationDurations: number[] = [];
  for (const [index, item] of mutationFeed.items.entries()) {
    const like = await timed(mutationDurations, () =>
      createMatchingLike({
        currentUserId: requesterId,
        candidateId: item.candidate.id,
        candidateGrant: item.candidateGrant,
        agreements: [true, true, true],
        answers: [
          `load smoke answer ${index + 1}`,
          `load smoke repair answer ${index + 1}`,
        ],
        idempotencyKey: `${runId}:like:${index}`,
        auditRequest,
      }),
    );
    assert.equal(like.status, "SENT");
  }

  const inboxDurations: number[] = [];
  for (let sample = 0; sample < INBOX_SAMPLES; sample += 1) {
    const inbox = await timed(inboxDurations, () =>
      getMatchingInbox({ currentUserId: requesterId, limit: PAGE_SIZE }),
    );
    assert.equal(inbox.outgoing.length, PAGE_SIZE);
    assert.equal(
      new Set(inbox.outgoing.map((like) => like.id)).size,
      PAGE_SIZE,
    );
    assertNoPrivateMatchingData(inbox);
  }

  const directionalLikeCount = await Like.countDocuments({
    fromId: requesterId,
    toId: { $in: mutationFeed.items.map((item) => item.candidate.id) },
  });
  const effectCount = await MatchingSocialEffect.countDocuments({
    actorId: requesterId,
    name: "LIKE_CREATED",
  });
  const notificationCount = await Notification.countDocuments({
    userId: { $in: mutationFeed.items.map((item) => item.candidate.id) },
    type: "MATCH_LIKE_RECEIVED",
  });
  const auditCount = await EventLog.countDocuments({
    event: "MATCH_LIKE_CREATED",
    "actor.userId": requesterId,
  });
  assert.equal(directionalLikeCount, PAGE_SIZE);
  assert.equal(effectCount, PAGE_SIZE);
  assert.equal(notificationCount, PAGE_SIZE);
  assert.equal(auditCount, PAGE_SIZE);

  return {
    feed: summarizeDurations(feedDurations),
    card: summarizeDurations(cardDurations),
    mutation: summarizeDurations(mutationDurations),
    inbox: summarizeDurations(inboxDurations),
  };
};

const assertBudgets = (
  metrics: Awaited<ReturnType<typeof runMeasuredPaths>>,
): void => {
  assert.ok(metrics.feed.p95Ms <= P95_BUDGET_MS.feedRanking);
  assert.ok(metrics.feed.p99Ms <= FEED_P99_BUDGET_MS);
  assert.ok(metrics.card.p95Ms <= P95_BUDGET_MS.candidateCard);
  assert.ok(metrics.inbox.p95Ms <= P95_BUDGET_MS.inbox);
  assert.ok(metrics.mutation.p95Ms <= P95_BUDGET_MS.socialMutation);
};

const cleanup = async (): Promise<true> => {
  if (mongoose.connection.readyState !== 1) return true;
  await Promise.all([
    Notification.deleteMany({ userId: { $in: fixtureUserIds } }),
    EventLog.deleteMany({
      $or: [
        { "actor.userId": { $in: fixtureUserIds } },
        { "target.id": { $in: fixtureUserIds } },
      ],
    }),
    MatchingSocialEffect.deleteMany({
      participantIds: { $in: fixtureUserIds },
    }),
    MatchingEvaluationSnapshot.deleteMany({
      $or: [
        { requesterId: { $in: fullOwnerIds } },
        { candidateId: { $in: fullOwnerIds } },
      ],
    }),
    MatchingFeedSession.deleteMany({ requesterId: { $in: fullOwnerIds } }),
    CandidatePresentationGrant.deleteMany({
      $or: [
        { requesterId: { $in: fixtureUserIds } },
        { candidateId: { $in: fixtureUserIds } },
      ],
    }),
    MatchingBlock.deleteMany({
      $or: [
        { blockerId: { $in: fixtureUserIds } },
        { blockedId: { $in: fixtureUserIds } },
      ],
    }),
    MatchingConnection.deleteMany({ participantIds: { $in: fixtureUserIds } }),
    Like.deleteMany({
      $or: [
        { fromId: { $in: fixtureUserIds } },
        { toId: { $in: fixtureUserIds } },
      ],
    }),
    PairMembershipClaim.deleteMany({ userId: { $in: fixtureUserIds } }),
  ]);
  await Promise.all([
    PartnerPreferenceProfile.deleteMany({ ownerId: { $in: fullOwnerIds } }),
    MatchingUseGrant.deleteMany({ ownerId: { $in: fullOwnerIds } }),
    EvidenceEvent.deleteMany({
      $or: [
        { actorId: { $in: fullOwnerIds } },
        { subjectId: { $in: fullOwnerIds } },
      ],
    }),
    IndividualFactorSnapshot.deleteMany({ subjectId: { $in: fullOwnerIds } }),
    MatchingProfile.deleteMany({ userId: { $in: fullOwnerIds } }),
    CandidateDiscoveryProjection.deleteMany({
      $or: [{ runId }, { userId: { $in: fullOwnerIds } }],
    }),
    User.deleteMany({ id: { $in: fixtureUserIds } }),
  ]);
  const remainingCounts = await Promise.all([
    User.countDocuments({ id: { $in: fixtureUserIds } }),
    CandidateDiscoveryProjection.countDocuments({
      $or: [{ runId }, { userId: { $in: fullOwnerIds } }],
    }),
    MatchingProfile.countDocuments({ userId: { $in: fullOwnerIds } }),
    IndividualFactorSnapshot.countDocuments({
      subjectId: { $in: fullOwnerIds },
    }),
    MatchingUseGrant.countDocuments({ ownerId: { $in: fullOwnerIds } }),
    CandidatePresentationGrant.countDocuments({
      requesterId: { $in: fixtureUserIds },
    }),
    Like.countDocuments({ fromId: { $in: fixtureUserIds } }),
    MatchingSocialEffect.countDocuments({
      participantIds: { $in: fixtureUserIds },
    }),
    Notification.countDocuments({ userId: { $in: fixtureUserIds } }),
    EventLog.countDocuments({ "actor.userId": { $in: fixtureUserIds } }),
  ]);
  assert.ok(
    remainingCounts.every((count) => count === 0),
    "run-scoped cleanup failed",
  );
  return true;
};

const safeFailureCode = (error: Error): string => {
  if (error instanceof DomainError && /^[A-Z0-9_]{1,80}$/.test(error.code)) {
    return error.code;
  }
  if (/^MATCHING_[A-Z0-9_]{1,80}$/.test(error.message)) return error.message;
  return "MATCHING_LOAD_SMOKE_FAILED";
};

const main = async (): Promise<void> => {
  const topology = await requireAtlasTopology();
  let report:
    | (Omit<SuccessfulReport, "invariants"> & {
        invariants: Omit<SuccessfulReport["invariants"], "cleanupVerified">;
      })
    | null = null;
  let cleanupVerified = false;
  try {
    await assertRequiredIndexes();
    await seedFullParticipants();
    await seedScaleProjections();
    const discoveryQuery = await explainDiscoveryQuery();
    const captured = await captureBatchedFeed();
    const rankedCandidates = await assertStablePagination(captured.feed);
    const performanceMetrics = await runMeasuredPaths(captured.feed);
    assertBudgets(performanceMetrics);
    report = {
      ok: true,
      gate: "FACTOR_MATCHING_LOAD_SMOKE",
      topology,
      fixtures: {
        candidateProjections: CANDIDATE_PROJECTION_COUNT,
        rankedCandidates,
        pageSize: PAGE_SIZE,
        preselectionLimit: PRESELECTION_LIMIT,
      },
      discoveryQuery,
      batching: captured.batching,
      performance: {
        feedRanking: {
          ...performanceMetrics.feed,
          p95BudgetMs: P95_BUDGET_MS.feedRanking,
          p99BudgetMs: FEED_P99_BUDGET_MS,
        },
        inbox: {
          ...performanceMetrics.inbox,
          p95BudgetMs: P95_BUDGET_MS.inbox,
        },
        candidateCard: {
          ...performanceMetrics.card,
          p95BudgetMs: P95_BUDGET_MS.candidateCard,
        },
        socialMutation: {
          ...performanceMetrics.mutation,
          p95BudgetMs: P95_BUDGET_MS.socialMutation,
        },
      },
      invariants: {
        stablePagination: true,
        unexpected5xx: 0,
        duplicateViolations: 0,
        crossUserDisclosure: 0,
      },
    };
  } finally {
    cleanupVerified = await cleanup();
    await mongoose.disconnect();
  }
  assert.ok(report);
  const finalReport: SuccessfulReport = {
    ...report,
    invariants: { ...report.invariants, cleanupVerified },
  };
  console.log(JSON.stringify(finalReport));
};

void main().catch((error: Error) => {
  console.error(
    JSON.stringify({
      ok: false,
      gate: "FACTOR_MATCHING_LOAD_SMOKE",
      errorCode: safeFailureCode(error),
    }),
  );
  process.exitCode = 1;
});
