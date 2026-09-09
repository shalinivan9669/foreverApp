import { getMatchingLike } from "@/domain/services/matching/matchingApplication.service";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { DomainError } from "@/domain/errors";
import { formPairInSession } from "@/domain/services/pairFormation.service";
import {
  createMatchingSocialService,
  mongoCandidateGrantValidationPort,
  mongoMatchingParticipantFencePort,
  type CreateSocialLikeInput,
  type MatchingCardSnapshot,
  type MatchingConnectionResult,
  type PairFormationPort,
} from "@/domain/services/matching/social";
import { connectToDatabase } from "@/lib/mongodb";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { Like } from "@/models/Like";
import { MatchingConnection } from "@/models/MatchingConnection";
import { MatchingFeedSession } from "@/models/MatchingFeedSession";
import { MatchingProfile } from "@/models/MatchingProfile";
import { MvpOnboardingSession } from "@/models/MvpOnboardingSession";
import { Notification } from "@/models/Notification";
import { Pair } from "@/models/Pair";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import { User } from "@/models/User";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

type Coordinates = readonly [longitude: number, latitude: number];

type ParticipantFixture = {
  userId: string;
  card: MatchingCardSnapshot;
  age: number;
  coordinates: Coordinates;
};

type ParticipantInput = {
  label: string;
  age: number;
  coordinates: Coordinates;
  desiredAgeRange: { min: number; max: number };
  maxDistanceKm: number;
  completedOnboarding?: boolean;
};

const runId = `matching-pair-transition-${Date.now()}-${randomUUID()}`;
const userPrefix = `${runId}:`;
const participants = new Map<string, ParticipantFixture>();

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const cardFor = (label: string): MatchingCardSnapshot => ({
  requirements: [
    `${label} requirement 1`,
    `${label} requirement 2`,
    `${label} requirement 3`,
  ],
  give: [`${label} offer 1`, `${label} offer 2`, `${label} offer 3`],
  questions: [`${label} question 1`, `${label} question 2`],
});

const createParticipant = async (
  input: ParticipantInput,
): Promise<ParticipantFixture> => {
  const userId = `${userPrefix}${input.label}`;
  const card = cardFor(input.label);
  const projectionHash = sha256(`${runId}:${input.label}:projection`);
  const fixture: ParticipantFixture = {
    userId,
    card,
    age: input.age,
    coordinates: input.coordinates,
  };
  participants.set(userId, fixture);

  await User.create({
    id: userId,
    entryCohort: "SOLO",
    username: input.label,
    avatar: "matching-pair-transition-fixture",
    pairMembershipRevision: 0,
    profile: { onboarding: { seeking: { valuedQualities: ["kindness", "honesty", "respect"] } } },
    personal: {
      gender: "female",
      age: input.age,
      city: "Matching Integration City",
      relationshipStatus: "seeking",
    },
    preferences: {
      desiredAgeRange: input.desiredAgeRange,
      maxDistanceKm: input.maxDistanceKm,
    },
    location: {
      type: "Point",
      coordinates: [...input.coordinates],
    },
  });
  await Promise.all([
    MatchingProfile.create({
      userId,
      card: {
        requirements: [...card.requirements],
        give: [...card.give],
        questions: [...card.questions],
      },
      discoveryRequested: true,
      active: true,
      requiredDataReady: true,
      desiredAgeRange: input.desiredAgeRange,
      maxDistanceKm: input.maxDistanceKm,
      city: "Matching Integration City",
      publicCardRevision: 1,
      actualProfileRevision: 1,
      preferenceRevision: 1,
      registryVersion: 1,
      algorithmVersion: 1,
      projectionHash,
      runId,
    }),
    CandidateDiscoveryProjection.create({
      userId,
      active: true,
      requiredDataReady: true,
      age: input.age,
      city: "Matching Integration City",
      location: {
        type: "Point",
        coordinates: [...input.coordinates],
      },
      relationshipIntent: "SEEKING_RELATIONSHIP",
      publicCardRevision: 1,
      actualProfileRevision: 1,
      preferenceRevision: 1,
      registryVersion: 1,
      algorithmVersion: 1,
      projectionHash,
      runId,
    }),
    ...(input.completedOnboarding
      ? [
          MvpOnboardingSession.create({
            userId,
            status: "completed",
            contentRevision: `matching-pair-transition-${runId}`,
            policyVersion: "matching-pair-transition-v1",
            consent: {
              adultConfirmed: true,
              voluntaryParticipationConfirmed: true,
              privacyAcknowledged: true,
              confirmedAt: new Date(),
            },
            cursor: 0,
            answers: [],
            factorEngine: {
              status: "MATERIALIZED",
              registryVersion: 1,
              evidenceEventIds: [],
              individualSnapshotIds: [],
            },
            startedAt: new Date(),
            completedAt: new Date(),
          }),
        ]
      : []),
  ]);
  return fixture;
};

const issueCandidateGrant = async (
  requesterId: string,
  candidateId: string,
): Promise<string> => {
  const token = `${runId}:${requesterId}:${candidateId}:${randomUUID()}`;
  await CandidatePresentationGrant.create({
    tokenHash: sha256(token),
    requesterId,
    candidateId,
    evaluationId: `${runId}:${randomUUID()}`,
    requesterProfileRevision: 1,
    candidateProfileRevision: 1,
    requesterCardRevision: 1,
    candidateCardRevision: 1,
    requesterPreferenceRevision: 1,
    candidatePreferenceRevision: 1,
    registryVersion: 1,
    algorithmVersion: 1,
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
    runId,
  });
  return token;
};

const createLikeInput = async (
  senderId: string,
  recipientId: string,
  label: string,
): Promise<CreateSocialLikeInput> => {
  const sender = participants.get(senderId);
  const recipient = participants.get(recipientId);
  assert.ok(sender, `Missing sender fixture: ${label}`);
  assert.ok(recipient, `Missing recipient fixture: ${label}`);
  return {
    senderId,
    recipientId,
    candidateGrantToken: await issueCandidateGrant(senderId, recipientId),
    idempotencyKey: `${label}-${randomUUID()}`,
    senderCardSnapshot: sender.card,
    senderCardRevision: 1,
    targetCardSnapshot: recipient.card,
    targetCardRevision: 1,
    agreements: [true, true, true],
    answers: [`${label} answer 1`, `${label} answer 2`],
  };
};

const pairFormation: PairFormationPort = {
  async formFromMatchingConnection(input) {
    return formPairInSession({
      source: "MATCHING_CONNECTION",
      sourceId: input.connectionId,
      members: [...input.participantIds],
      now: input.now,
      session: input.session,
    });
  },
};

const socialService = createMatchingSocialService({
  candidateGrants: mongoCandidateGrantValidationPort,
  participantFence: mongoMatchingParticipantFencePort,
  pairFormation,
});

const assertGrantRejected = async (
  input: CreateSocialLikeInput,
): Promise<void> => {
  await assert.rejects(
    () => socialService.createLike(input),
    (error: Error) =>
      error instanceof DomainError &&
      error.code === "CANDIDATE_GRANT_UNAVAILABLE" &&
      error.status === 409,
  );
  assert.equal(
    await Like.countDocuments({
      fromId: input.senderId,
      toId: input.recipientId,
    }),
    0,
  );
};

const exerciseLiteralEligibilityBoundaries = async (): Promise<void> => {
  const boundaryDistanceKm = 10;
  const exactBoundaryLongitude = (boundaryDistanceKm / 6_371) * (180 / Math.PI);
  const outsideBoundaryLongitude =
    ((boundaryDistanceKm + 0.001) / 6_371) * (180 / Math.PI);

  const requester = await createParticipant({
    label: "boundary-requester",
    age: 30,
    coordinates: [0, 0],
    desiredAgeRange: { min: 40, max: 40 },
    maxDistanceKm: boundaryDistanceKm,
  });
  const exactBoundary = await createParticipant({
    label: "boundary-exact",
    age: 40,
    coordinates: [exactBoundaryLongitude, 0],
    desiredAgeRange: { min: 30, max: 30 },
    maxDistanceKm: boundaryDistanceKm,
  });
  const ageOutside = await createParticipant({
    label: "boundary-age-outside",
    age: 41,
    coordinates: [0, 0],
    desiredAgeRange: { min: 30, max: 30 },
    maxDistanceKm: boundaryDistanceKm,
  });
  const distanceOutside = await createParticipant({
    label: "boundary-distance-outside",
    age: 40,
    coordinates: [outsideBoundaryLongitude, 0],
    desiredAgeRange: { min: 30, max: 30 },
    maxDistanceKm: boundaryDistanceKm,
  });

  const accepted = await socialService.createLike(
    await createLikeInput(
      requester.userId,
      exactBoundary.userId,
      "literal-age-distance-boundary",
    ),
  );
  assert.equal(accepted.status, "SENT");
  await assertGrantRejected(
    await createLikeInput(
      requester.userId,
      ageOutside.userId,
      "literal-age-outside",
    ),
  );
  await assertGrantRejected(
    await createLikeInput(
      requester.userId,
      distanceOutside.userId,
      "literal-distance-outside",
    ),
  );
};

const createActiveConnection = async (
  senderId: string,
  recipientId: string,
  label: string,
): Promise<{ likeId: string; connectionId: string }> => {
  const like = await socialService.createLike(
    await createLikeInput(senderId, recipientId, label),
  );
  const response = await socialService.respondToLike({
    actorId: recipientId,
    likeId: like.likeId,
    agreements: [true, true, true],
    answers: [`${label} response 1`, `${label} response 2`],
  });
  assert.equal(response.status, "MATCHED");
  const stored = await Like.findById(like.likeId).lean();
  assert.ok(stored?.connectionId, "Response acceptance must atomically create a Connection");
  return { likeId: like.likeId, connectionId: String(stored.connectionId) };
};

const exerciseConnectionCapacityAndPending = async (): Promise<void> => {
  const [owner, b, c, d, e] = await Promise.all(["slots-owner", "slots-b", "slots-c", "slots-d", "slots-e"].map((label) => createParticipant({ label, age: 30, coordinates: [60, 45], desiredAgeRange: { min: 18, max: 99 }, maxDistanceKm: 500 })));
  const first = await createActiveConnection(owner.userId, b.userId, "slots-first");
  await createActiveConnection(owner.userId, c.userId, "slots-second");
  await socialService.confirmConnection({ actorId: b.userId, connectionId: first.connectionId, action: "PAUSE" });
  const pending = await Promise.all([d, e].map(async (peer) => ({ peer, like: await socialService.createLike(await createLikeInput(owner.userId, peer.userId, peer.userId)) })));
  const respond = (item: typeof pending[number]) => socialService.respondToLike({ actorId: item.peer.userId, likeId: item.like.likeId, agreements: [true, true, true], answers: ["capacity answer one", "capacity answer two"] });
  const race = await Promise.allSettled(pending.map(respond));
  assert.equal(race.filter((item) => item.status === "fulfilled").length, 1, "Two acceptances racing for one slot must create only one connection");
  const rejected = race.find((item) => item.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof DomainError && rejected.reason.code === "MATCHING_CONNECTION_LIMIT");
  assert.equal(await MatchingConnection.countDocuments({ participantIds: owner.userId, status: { $in: ["ACTIVE", "PAUSED"] } }), 3);
  const loser = pending[race.findIndex((item) => item.status === "rejected")];
  assert.equal((await Like.findById(loser.like.likeId).lean())?.status, "SENT", "A rejected acceptance must not partially persist the response");
  await socialService.confirmConnection({ actorId: b.userId, connectionId: first.connectionId, action: "CLOSE" });
  assert.equal((await respond(loser)).status, "MATCHED");
  const withdrawn = await socialService.createLike(await createLikeInput(owner.userId, b.userId, "withdraw-pending"));
  assert.equal((await socialService.withdrawLike({ actorId: owner.userId, likeId: withdrawn.likeId })).status, "WITHDRAWN");
  assert.equal((await socialService.withdrawLike({ actorId: owner.userId, likeId: withdrawn.likeId })).noop, true);
  const expired = await socialService.createLike(await createLikeInput(owner.userId, b.userId, "expire-pending"));
  await Like.collection.updateOne({ _id: new Types.ObjectId(expired.likeId) }, { $set: { createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) } });
  await assert.rejects(() => socialService.respondToLike({ actorId: b.userId, likeId: expired.likeId, agreements: [true, true, true], answers: ["too late one", "too late two"] }), (error: Error) => error instanceof DomainError && error.status === 409);
  assert.equal((await getMatchingLike({ currentUserId: owner.userId, likeId: expired.likeId })).status, "EXPIRED");
};

const fulfilledResults = (
  results: readonly PromiseSettledResult<MatchingConnectionResult>[],
): MatchingConnectionResult[] =>
  results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

const rejectedReasons = (
  results: readonly PromiseSettledResult<MatchingConnectionResult>[],
): unknown[] =>
  results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );

const exercisePairTransitionRace = async (): Promise<void> => {
  const [memberA, memberB, memberC, extraCandidate] = await Promise.all([
    createParticipant({
      label: "race-a",
      age: 30,
      coordinates: [60, 45],
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 20_000,
      completedOnboarding: true,
    }),
    createParticipant({
      label: "race-b",
      age: 31,
      coordinates: [60.01, 45],
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 20_000,
      completedOnboarding: true,
    }),
    createParticipant({
      label: "race-c",
      age: 32,
      coordinates: [60.02, 45],
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 20_000,
      completedOnboarding: true,
    }),
    createParticipant({
      label: "race-extra",
      age: 33,
      coordinates: [60.03, 45],
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 20_000,
    }),
  ]);

  const connectionAB = await createActiveConnection(
    memberA.userId,
    memberB.userId,
    "race-ab",
  );
  const connectionAC = await createActiveConnection(
    memberA.userId,
    memberC.userId,
    "race-ac",
  );
  const extraLike = await socialService.createLike(
    await createLikeInput(
      memberA.userId,
      extraCandidate.userId,
      "race-extra-like",
    ),
  );

  const extraResponse = await socialService.respondToLike({ actorId: extraCandidate.userId, likeId: extraLike.likeId, agreements: [true, true, true], answers: ["extra response one", "extra response two"] });
  assert.equal(extraResponse.status, "MATCHED");
  const extraStored = await Like.findById(extraLike.likeId).lean();
  assert.ok(extraStored?.connectionId);
  await socialService.confirmConnection({ actorId: extraCandidate.userId, connectionId: String(extraStored.connectionId), action: "PAUSE" });

  await Promise.all([
    socialService.confirmConnection({
      actorId: memberA.userId,
      connectionId: connectionAB.connectionId,
      action: "REQUEST",
    }),
    socialService.confirmConnection({
      actorId: memberA.userId,
      connectionId: connectionAC.connectionId,
      action: "REQUEST",
    }),
  ]);

  const raceResults = await Promise.allSettled([
    socialService.confirmConnection({
      actorId: memberB.userId,
      connectionId: connectionAB.connectionId,
      action: "CONFIRM",
    }),
    socialService.confirmConnection({
      actorId: memberC.userId,
      connectionId: connectionAC.connectionId,
      action: "CONFIRM",
    }),
  ]);
  const winners = fulfilledResults(raceResults);
  const losers = rejectedReasons(raceResults);
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 1);
  assert.ok(losers[0] instanceof DomainError);
  assert.equal(losers[0].status, 409);

  const winner = winners[0];
  assert.ok(winner);
  assert.ok(winner.pairId);
  const winnerIsAB = winner.connectionId === connectionAB.connectionId;
  const winnerPartner = winnerIsAB ? memberB : memberC;
  const loserPartner = winnerIsAB ? memberC : memberB;
  const winnerLikeId = winnerIsAB ? connectionAB.likeId : connectionAC.likeId;
  const loserLikeId = winnerIsAB ? connectionAC.likeId : connectionAB.likeId;
  const loserConnectionId = winnerIsAB
    ? connectionAC.connectionId
    : connectionAB.connectionId;
  const winnerMemberIds = [memberA.userId, winnerPartner.userId].sort();

  const [pair, claims, sourceConnection, conflictingConnection, likes] =
    await Promise.all([
      Pair.findById(winner.pairId).lean(),
      PairMembershipClaim.find({
        userId: { $in: [memberA.userId, memberB.userId, memberC.userId] },
      }).lean(),
      MatchingConnection.findById(winner.connectionId).lean(),
      MatchingConnection.findById(loserConnectionId).lean(),
      Like.find({
        _id: {
          $in: [winnerLikeId, loserLikeId, extraLike.likeId].map(
            (id) => new Types.ObjectId(id),
          ),
        },
      }).lean(),
    ]);

  assert.ok(pair);
  assert.deepEqual([...pair.members].sort(), winnerMemberIds);
  assert.equal(pair.status, "active");
  assert.equal(
    await Pair.countDocuments({
      members: memberA.userId,
      status: { $in: ["active", "paused"] },
    }),
    1,
  );
  assert.equal(claims.length, 2);
  assert.deepEqual(claims.map((claim) => claim.userId).sort(), winnerMemberIds);
  assert.ok(
    claims.every(
      (claim) =>
        claim.source === "MATCHING_CONNECTION" &&
        claim.sourceId === winner.connectionId &&
        String(claim.pairId) === winner.pairId,
    ),
  );
  assert.equal(
    await PairMembershipClaim.countDocuments({ userId: loserPartner.userId }),
    0,
  );

  assert.equal(String(sourceConnection?.pairId), winner.pairId);
  assert.equal(sourceConnection?.status, "ACTIVE");
  assert.equal(sourceConnection?.stage, "COUPLE_CONFIRMED");
  assert.equal(conflictingConnection?.status, "CLOSED");
  assert.equal(conflictingConnection?.pairId, undefined);

  const statusByLikeId = new Map(
    likes.map((like) => [String(like._id), like.status]),
  );
  assert.equal(statusByLikeId.get(winnerLikeId), "MATCHED");
  assert.equal(statusByLikeId.get(loserLikeId), "EXPIRED");
  assert.equal(statusByLikeId.get(extraLike.likeId), "EXPIRED");
  assert.equal((await MatchingConnection.findById(extraStored.connectionId).lean())?.status, "CLOSED", "Pair formation also closes paused connections");

  const [winnerProfiles, winnerProjections, loserProfile, grants, users] =
    await Promise.all([
      MatchingProfile.find({ userId: { $in: winnerMemberIds } }).lean(),
      CandidateDiscoveryProjection.find({
        userId: { $in: winnerMemberIds },
      }).lean(),
      MatchingProfile.findOne({ userId: loserPartner.userId }).lean(),
      CandidatePresentationGrant.find({
        runId,
        $or: [
          { requesterId: { $in: winnerMemberIds } },
          { candidateId: { $in: winnerMemberIds } },
        ],
      }).lean(),
      User.find({
        id: { $in: [memberA.userId, memberB.userId, memberC.userId] },
      }).lean(),
    ]);
  assert.equal(winnerProfiles.length, 2);
  assert.ok(
    winnerProfiles.every(
      (profile) => !profile.active && !profile.discoveryRequested,
    ),
  );
  assert.equal(winnerProjections.length, 2);
  assert.ok(winnerProjections.every((projection) => !projection.active));
  assert.equal(loserProfile?.active, true);
  assert.equal(grants.length, 3);
  assert.ok(grants.every((grant) => grant.revokedAt instanceof Date));

  const relationshipStatusByUserId = new Map(
    users.map((user) => [user.id, user.personal.relationshipStatus]),
  );
  assert.equal(
    relationshipStatusByUserId.get(memberA.userId),
    "in_relationship",
  );
  assert.equal(
    relationshipStatusByUserId.get(winnerPartner.userId),
    "in_relationship",
  );
  assert.equal(relationshipStatusByUserId.get(loserPartner.userId), "seeking");

  const replay = await socialService.confirmConnection({
    actorId: winnerPartner.userId,
    connectionId: winner.connectionId,
    action: "CONFIRM",
  });
  assert.equal(replay.noop, true);
  assert.equal(replay.pairId, winner.pairId);
  assert.equal(await Pair.countDocuments({ _id: winner.pairId }), 1);
  assert.equal(
    await PairMembershipClaim.countDocuments({
      source: "MATCHING_CONNECTION",
      sourceId: winner.connectionId,
    }),
    2,
  );
};

const ensureIndexes = async (): Promise<void> => {
  await Promise.all([
    User.createIndexes(),
    MatchingProfile.createIndexes(),
    CandidateDiscoveryProjection.createIndexes(),
    CandidatePresentationGrant.createIndexes(),
    Like.createIndexes(),
    MatchingConnection.createIndexes(),
    PairMembershipClaim.createIndexes(),
    Pair.createIndexes(),
    MvpOnboardingSession.createIndexes(),
    Notification.createIndexes(),
  ]);
};

const cleanup = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 1) return;
  const userIds = [...participants.keys()];
  const fixturePairs = await Pair.find({ members: { $in: userIds } })
    .select({ _id: 1 })
    .lean<Array<{ _id: Types.ObjectId }>>();
  const pairIds = fixturePairs.map((pair) => pair._id);

  await Notification.deleteMany({
    $or: [
      { userId: { $in: userIds } },
      ...(pairIds.length ? [{ pairId: { $in: pairIds } }] : []),
    ],
  });
  await PairMembershipClaim.deleteMany({ userId: { $in: userIds } });
  if (pairIds.length > 0) {
    await Pair.deleteMany({ _id: { $in: pairIds } });
  }
  await Promise.all([
    MatchingConnection.deleteMany({ participantIds: { $in: userIds } }),
    Like.deleteMany({
      $or: [{ fromId: { $in: userIds } }, { toId: { $in: userIds } }],
    }),
    CandidatePresentationGrant.deleteMany({ runId }),
    MatchingFeedSession.deleteMany({ runId }),
    MatchingProfile.deleteMany({ runId }),
    CandidateDiscoveryProjection.deleteMany({ runId }),
    MvpOnboardingSession.deleteMany({ userId: { $in: userIds } }),
  ]);
  await User.deleteMany({ id: { $in: userIds } });
};

const main = async (): Promise<void> => {
  const target = requireMatchingTestDatabaseTarget();
  process.env.MONGODB_URI = target.uri;
  await connectToDatabase();
  try {
    await ensureIndexes();
    await exerciseLiteralEligibilityBoundaries();
    await exerciseConnectionCapacityAndPending();
    await exercisePairTransitionRace();
    console.log("matching-pair-transition.integration: ok");
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(
    `matching-pair-transition.integration: failed (${error.name}: ${error.message})`,
  );
  process.exitCode = 1;
});
