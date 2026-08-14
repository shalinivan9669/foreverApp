import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { DomainError } from "@/domain/errors";
import {
  createMatchingSocialService,
  mongoCandidateGrantValidationPort,
  mongoMatchingParticipantFencePort,
  type CreateSocialLikeInput,
  type MatchingCardSnapshot,
  type MatchingSocialEffectsPort,
  type PairFormationPort,
} from "@/domain/services/matching/social";
import { connectToDatabase } from "@/lib/mongodb";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { Like } from "@/models/Like";
import { MatchingBlock } from "@/models/MatchingBlock";
import { MatchingConnection } from "@/models/MatchingConnection";
import { MatchingProfile } from "@/models/MatchingProfile";
import { Pair } from "@/models/Pair";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import { User } from "@/models/User";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

type EffectFixture = {
  _id: string;
  runId: string;
  name: string;
  actorId: string;
  participantIds: string[];
  resourceId: string;
  recordedAt: Date;
};

const hash = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const runId = `matching-races-${Date.now()}-${randomUUID()}`;
const userPrefix = `${runId}:`;
const userIds = new Set<string>();
const formedPairIds = new Set<Types.ObjectId>();
const cards = new Map<string, MatchingCardSnapshot>();

const cardFor = (label: string): MatchingCardSnapshot => ({
  requirements: [
    `${label} requirement 1`,
    `${label} requirement 2`,
    `${label} requirement 3`,
  ],
  give: [`${label} offer 1`, `${label} offer 2`, `${label} offer 3`],
  questions: [`${label} question 1`, `${label} question 2`],
});

const createParticipant = async (label: string): Promise<string> => {
  const userId = `${userPrefix}${label}`;
  const card = cardFor(label);
  userIds.add(userId);
  cards.set(userId, card);
  await MatchingProfile.create({
    userId,
    card: {
      requirements: [...card.requirements],
      give: [`${label} offer 1`, `${label} offer 2`, `${label} offer 3`],
      questions: [...card.questions],
    },
    discoveryRequested: true,
    active: true,
    requiredDataReady: true,
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 20_000,
    publicCardRevision: 1,
    actualProfileRevision: 1,
    preferenceRevision: 1,
    registryVersion: 1,
    algorithmVersion: 1,
    projectionHash: hash(`${runId}:${label}:projection`),
    runId,
  });
  await CandidateDiscoveryProjection.create({
    userId,
    active: true,
    requiredDataReady: true,
    age: 30,
    city: "Fixture City",
    location: { type: "Point", coordinates: [0, 0] },
    relationshipIntent: "SEEKING_RELATIONSHIP",
    publicCardRevision: 1,
    actualProfileRevision: 1,
    preferenceRevision: 1,
    registryVersion: 1,
    algorithmVersion: 1,
    projectionHash: hash(`${runId}:${label}:discovery`),
    runId,
  });
  await User.create({
    id: userId,
    username: label,
    avatar: "fixture-avatar",
    pairMembershipRevision: 0,
    personal: {
      gender: "female",
      age: 30,
      city: "Fixture City",
      relationshipStatus: "seeking",
    },
    preferences: {
      desiredAgeRange: { min: 18, max: 99 },
      maxDistanceKm: 20_000,
    },
  });
  return userId;
};

const issueGrant = async (
  requesterId: string,
  candidateId: string,
): Promise<string> => {
  const token = `${runId}:${requesterId}:${candidateId}:${randomUUID()}`;
  await CandidatePresentationGrant.create({
    tokenHash: hash(token),
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
    expiresAt: new Date(Date.now() + 10 * 60 * 1_000),
    runId,
  });
  return token;
};

const createLikeInput = async (
  senderId: string,
  recipientId: string,
  idempotencyKey = randomUUID(),
): Promise<CreateSocialLikeInput> => {
  const senderCardSnapshot = cards.get(senderId);
  const targetCardSnapshot = cards.get(recipientId);
  assert.ok(senderCardSnapshot);
  assert.ok(targetCardSnapshot);
  return {
    senderId,
    recipientId,
    candidateGrantToken: await issueGrant(senderId, recipientId),
    idempotencyKey,
    senderCardSnapshot,
    senderCardRevision: 1,
    targetCardSnapshot,
    targetCardRevision: 1,
    agreements: [true, true, true],
    answers: ["sender answer 1", "sender answer 2"],
  };
};

const effectCollection = () =>
  mongoose.connection.collection<EffectFixture>(
    "matching_social_effect_fixtures",
  );

const effects: MatchingSocialEffectsPort = {
  async record(input): Promise<void> {
    await effectCollection().updateOne(
      { _id: input.effectKey },
      {
        $setOnInsert: {
          _id: input.effectKey,
          runId,
          name: input.name,
          actorId: input.actorId,
          participantIds: [...input.participantIds],
          resourceId: input.resourceId,
          recordedAt: input.now,
        },
      },
      { upsert: true, session: input.session },
    );
  },
};

const pairFormation: PairFormationPort = {
  async formFromMatchingConnection(input) {
    const existingClaims = await PairMembershipClaim.find({
      source: "MATCHING_CONNECTION",
      sourceId: input.connectionId,
    })
      .session(input.session)
      .lean<Array<{ userId: string; pairId: Types.ObjectId }>>();
    if (existingClaims.length > 0) {
      assert.equal(existingClaims.length, 2);
      assert.deepEqual(existingClaims.map((claim) => claim.userId).sort(), [
        ...input.participantIds,
      ]);
      const existingPairIds = [
        ...new Set(existingClaims.map((claim) => String(claim.pairId))),
      ];
      assert.equal(existingPairIds.length, 1);
      return { pairId: existingPairIds[0]!, alreadyFormed: true };
    }

    const pairId = new Types.ObjectId();
    formedPairIds.add(pairId);
    await PairMembershipClaim.insertMany(
      input.participantIds.map((userId) => ({
        userId,
        pairId,
        source: "MATCHING_CONNECTION",
        sourceId: input.connectionId,
        pairKey: input.participantIds.join("|"),
      })),
      { session: input.session },
    );
    await Pair.create(
      [
        {
          _id: pairId,
          members: [...input.participantIds],
          key: input.participantIds.join("|"),
          status: "active",
          contextVersion: "pair-context-v1",
        },
      ],
      { session: input.session },
    );
    return { pairId: String(pairId), alreadyFormed: false };
  },
};

const service = createMatchingSocialService({
  candidateGrants: mongoCandidateGrantValidationPort,
  participantFence: mongoMatchingParticipantFencePort,
  pairFormation,
  effects,
});

const countFulfilled = <Result>(
  results: readonly PromiseSettledResult<Result>[],
): number => results.filter((result) => result.status === "fulfilled").length;

const assertSingleRaceWinner = <Result>(
  results: readonly PromiseSettledResult<Result>[],
): void => {
  assert.equal(countFulfilled(results), 1);
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0]?.reason instanceof DomainError);
  assert.equal(rejected[0]?.reason.status, 409);
};

const cleanup = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 1) return;
  const fixtureUsers = [...userIds];
  await PairMembershipClaim.deleteMany({ userId: { $in: fixtureUsers } });
  await Pair.deleteMany({ _id: { $in: [...formedPairIds] } });
  await MatchingConnection.deleteMany({
    participantIds: { $in: fixtureUsers },
  });
  await MatchingBlock.deleteMany({
    $or: [
      { blockerId: { $in: fixtureUsers } },
      { blockedId: { $in: fixtureUsers } },
    ],
  });
  await Like.deleteMany({
    $or: [{ fromId: { $in: fixtureUsers } }, { toId: { $in: fixtureUsers } }],
  });
  await CandidatePresentationGrant.deleteMany({ runId });
  await CandidateDiscoveryProjection.deleteMany({ runId });
  await MatchingProfile.deleteMany({ runId });
  await User.deleteMany({ id: { $in: fixtureUsers } });
  await effectCollection().deleteMany({ runId });
};

const main = async (): Promise<void> => {
  const target = requireMatchingTestDatabaseTarget();
  process.env.MONGODB_URI = target.uri;
  await connectToDatabase();
  try {
    await Promise.all([
      Like.createIndexes(),
      MatchingConnection.createIndexes(),
      MatchingBlock.createIndexes(),
      MatchingProfile.createIndexes(),
      CandidateDiscoveryProjection.createIndexes(),
      CandidatePresentationGrant.createIndexes(),
      PairMembershipClaim.createIndexes(),
    ]);

    const idemSender = await createParticipant("idem-sender");
    const idemRecipient = await createParticipant("idem-recipient");
    const idempotentInput = await createLikeInput(
      idemSender,
      idemRecipient,
      `idem-${randomUUID()}`,
    );
    const idempotentResults = await Promise.all(
      Array.from({ length: 20 }, () => service.createLike(idempotentInput)),
    );
    assert.equal(
      new Set(idempotentResults.map((result) => result.likeId)).size,
      1,
    );
    assert.equal(
      idempotentResults.filter((result) => !result.replayed).length,
      1,
    );
    const idempotentLikeId = idempotentResults[0]!.likeId;
    assert.equal(
      await Like.countDocuments({ fromId: idemSender, toId: idemRecipient }),
      1,
    );
    assert.equal(
      await effectCollection().countDocuments({
        runId,
        name: "LIKE_CREATED",
        resourceId: idempotentLikeId,
      }),
      1,
    );
    await assert.rejects(
      () =>
        service.createLike({
          ...idempotentInput,
          answers: ["changed answer", "sender answer 2"],
        }),
      (error: Error) =>
        error instanceof DomainError &&
        error.code === "IDEMPOTENCY_KEY_REUSE_CONFLICT" &&
        error.status === 409,
    );

    const directIdSender = await createParticipant("direct-id-sender");
    const directIdRecipient = await createParticipant("direct-id-recipient");
    const directIdOther = await createParticipant("direct-id-other");
    const directIdInput = await createLikeInput(
      directIdSender,
      directIdRecipient,
    );
    directIdInput.candidateGrantToken = await issueGrant(
      directIdSender,
      directIdOther,
    );
    await assert.rejects(
      () => service.createLike(directIdInput),
      (error: Error) =>
        error instanceof DomainError &&
        error.code === "CANDIDATE_GRANT_UNAVAILABLE" &&
        error.status === 409,
    );
    assert.equal(
      await Like.countDocuments({
        fromId: directIdSender,
        toId: directIdRecipient,
      }),
      0,
    );

    const originalSenderCard = cards.get(idemSender);
    assert.ok(originalSenderCard);
    await MatchingProfile.updateOne(
      { userId: idemSender },
      {
        $set: {
          card: {
            requirements: [
              "changed requirement 1",
              "changed requirement 2",
              "changed requirement 3",
            ],
            give: ["changed offer 1", "changed offer 2", "changed offer 3"],
            questions: ["changed question 1", "changed question 2"],
          },
          publicCardRevision: 2,
        },
      },
    );
    await service.respondToLike({
      actorId: idemRecipient,
      likeId: idempotentLikeId,
      agreements: [true, true, true],
      answers: ["recipient answer 1", "recipient answer 2"],
    });
    const immutableResponse = await Like.findById(idempotentLikeId)
      .select({ recipientResponse: 1, fromCardSnapshot: 1 })
      .lean();
    assert.deepEqual(
      immutableResponse?.recipientResponse?.initiatorCardSnapshot.requirements,
      [...originalSenderCard.requirements],
    );
    assert.deepEqual(
      immutableResponse?.recipientResponse?.initiatorCardSnapshot.questions,
      [...originalSenderCard.questions],
    );
    assert.deepEqual(immutableResponse?.fromCardSnapshot?.requirements, [
      ...originalSenderCard.requirements,
    ]);
    assert.equal(
      (
        await Like.findById(idempotentLikeId)
          .select({ targetCardSnapshot: 1, targetCardRevision: 1 })
          .lean()
      )?.targetCardRevision,
      1,
    );
    const progressedReplay = await service.createLike(idempotentInput);
    assert.deepEqual(
      {
        likeId: progressedReplay.likeId,
        status: progressedReplay.status,
        revision: progressedReplay.revision,
        replayed: progressedReplay.replayed,
      },
      {
        likeId: idempotentLikeId,
        status: "SENT",
        revision: 1,
        replayed: true,
      },
    );

    const responseSender = await createParticipant("response-sender");
    const responseRecipient = await createParticipant("response-recipient");
    const responseLike = await service.createLike(
      await createLikeInput(responseSender, responseRecipient),
    );
    const responseRace = await Promise.allSettled([
      service.respondToLike({
        actorId: responseRecipient,
        likeId: responseLike.likeId,
        agreements: [true, true, true],
        answers: ["response race 1", "response race 2"],
      }),
      service.declineLike({
        actorId: responseRecipient,
        likeId: responseLike.likeId,
      }),
    ]);
    assertSingleRaceWinner(responseRace);
    const responseRaceLike = await Like.findById(responseLike.likeId).lean();
    assert.ok(
      responseRaceLike?.status === "RESPONDED" ||
        responseRaceLike?.status === "DECLINED",
    );

    const directionSender = await createParticipant("direction-sender");
    const directionRecipient = await createParticipant("direction-recipient");
    const directionalInputA = await createLikeInput(
      directionSender,
      directionRecipient,
      `direction-a-${randomUUID()}`,
    );
    const directionalInputB = await createLikeInput(
      directionSender,
      directionRecipient,
      `direction-b-${randomUUID()}`,
    );
    const directionalRace = await Promise.allSettled([
      service.createLike(directionalInputA),
      service.createLike(directionalInputB),
    ]);
    assertSingleRaceWinner(directionalRace);
    assert.equal(
      await Like.countDocuments({
        fromId: directionSender,
        toId: directionRecipient,
        status: { $in: ["SENT", "VIEWED", "RESPONDED", "MATCHED"] },
      }),
      1,
    );

    const decisionSender = await createParticipant("decision-sender");
    const decisionRecipient = await createParticipant("decision-recipient");
    const decisionLike = await service.createLike(
      await createLikeInput(decisionSender, decisionRecipient),
    );
    await service.respondToLike({
      actorId: decisionRecipient,
      likeId: decisionLike.likeId,
      agreements: [true, true, true],
      answers: ["decision answer 1", "decision answer 2"],
    });
    const decisionRace = await Promise.allSettled([
      service.acceptLike({
        actorId: decisionSender,
        likeId: decisionLike.likeId,
      }),
      service.declineLike({
        actorId: decisionSender,
        likeId: decisionLike.likeId,
      }),
    ]);
    assertSingleRaceWinner(decisionRace);
    const decisionRaceLike = await Like.findById(decisionLike.likeId).lean();
    assert.ok(
      decisionRaceLike?.status === "MATCHED" ||
        decisionRaceLike?.status === "DECLINED",
    );

    const declineSender = await createParticipant("decline-sender");
    const declineRecipient = await createParticipant("decline-recipient");
    const declineLike = await service.createLike(
      await createLikeInput(declineSender, declineRecipient),
    );
    await service.respondToLike({
      actorId: declineRecipient,
      likeId: declineLike.likeId,
      agreements: [true, true, true],
      answers: ["decline answer 1", "decline answer 2"],
    });
    const senderDecline = await service.declineLike({
      actorId: declineSender,
      likeId: declineLike.likeId,
    });
    assert.equal(senderDecline.status, "DECLINED");
    const declinedDocument = await Like.findById(declineLike.likeId).lean();
    assert.equal(declinedDocument?.initiatorDecision?.accepted, false);
    await assert.rejects(
      () =>
        createLikeInput(declineSender, declineRecipient).then((input) =>
          service.createLike(input),
        ),
      (error: Error) =>
        error instanceof DomainError &&
        error.code === "MATCHING_STATE_CONFLICT" &&
        error.status === 409,
    );

    const blockSender = await createParticipant("block-sender");
    const blockRecipient = await createParticipant("block-recipient");
    const blockLike = await service.createLike(
      await createLikeInput(blockSender, blockRecipient),
    );
    await service.respondToLike({
      actorId: blockRecipient,
      likeId: blockLike.likeId,
      agreements: [true, true, true],
      answers: ["block answer 1", "block answer 2"],
    });
    const staleForwardInput = await createLikeInput(
      blockSender,
      blockRecipient,
    );
    const staleReverseInput = await createLikeInput(
      blockRecipient,
      blockSender,
    );
    const blockAt = new Date("2026-08-13T13:00:00.000Z");
    await Promise.allSettled([
      service.acceptLike({ actorId: blockSender, likeId: blockLike.likeId }),
      service.blockParticipant({
        actorId: blockRecipient,
        targetId: blockSender,
        now: blockAt,
      }),
    ]);
    const finalBlockedLike = await Like.findById(blockLike.likeId).lean();
    assert.equal(finalBlockedLike?.status, "BLOCKED");
    const finalBlock = await MatchingBlock.findOne({
      blockerId: blockRecipient,
      blockedId: blockSender,
    }).lean();
    assert.equal(finalBlock?.status, "ACTIVE");
    const blockedConnection = await MatchingConnection.findOne({
      participantIds: { $all: [blockSender, blockRecipient] },
    }).lean();
    assert.ok(!blockedConnection || blockedConnection.status === "BLOCKED");
    const revokedDirectionalGrants = await CandidatePresentationGrant.find({
      tokenHash: {
        $in: [
          hash(staleForwardInput.candidateGrantToken),
          hash(staleReverseInput.candidateGrantToken),
        ],
      },
    })
      .select("+tokenHash")
      .lean<Array<{ tokenHash: string; revokedAt?: Date }>>();
    assert.equal(revokedDirectionalGrants.length, 2);
    assert.ok(
      revokedDirectionalGrants.every(
        (grant) => grant.revokedAt?.getTime() === blockAt.getTime(),
      ),
    );
    const unblocked = await service.unblockParticipant({
      actorId: blockRecipient,
      targetId: blockSender,
    });
    assert.equal(unblocked.status, "REVOKED");
    assert.equal(
      (await Like.findById(blockLike.likeId).lean())?.status,
      "BLOCKED",
    );
    const stillBlockedConnection = await MatchingConnection.findOne({
      participantIds: { $all: [blockSender, blockRecipient] },
    }).lean();
    assert.ok(
      !stillBlockedConnection || stillBlockedConnection.status === "BLOCKED",
    );
    for (const staleInput of [staleForwardInput, staleReverseInput]) {
      await assert.rejects(
        () => service.createLike(staleInput),
        (error: Error) =>
          error instanceof DomainError &&
          error.code === "CANDIDATE_GRANT_UNAVAILABLE" &&
          error.status === 409,
      );
    }
    assert.equal(
      await Like.countDocuments({
        $or: [
          { fromId: blockSender, toId: blockRecipient, status: "SENT" },
          { fromId: blockRecipient, toId: blockSender, status: "SENT" },
        ],
      }),
      0,
    );

    const creationBlockSender = await createParticipant(
      "creation-block-sender",
    );
    const creationBlockRecipient = await createParticipant(
      "creation-block-recipient",
    );
    const creationBlockInput = await createLikeInput(
      creationBlockSender,
      creationBlockRecipient,
    );
    const creationBlockRace = await Promise.allSettled([
      service.createLike(creationBlockInput),
      service.blockParticipant({
        actorId: creationBlockRecipient,
        targetId: creationBlockSender,
      }),
    ]);
    assert.equal(creationBlockRace[1]?.status, "fulfilled");
    const creationRaceBlock = await MatchingBlock.findOne({
      blockerId: creationBlockRecipient,
      blockedId: creationBlockSender,
    }).lean();
    assert.equal(creationRaceBlock?.status, "ACTIVE");
    const creationRaceLikes = await Like.find({
      fromId: creationBlockSender,
      toId: creationBlockRecipient,
    }).lean();
    assert.ok(creationRaceLikes.length <= 1);
    assert.ok(
      creationRaceLikes.length === 0 ||
        creationRaceLikes[0]?.status === "BLOCKED",
    );

    const reciprocalA = await createParticipant("reciprocal-a");
    const reciprocalB = await createParticipant("reciprocal-b");
    const reciprocalLikeA = await service.createLike(
      await createLikeInput(reciprocalA, reciprocalB),
    );
    const reciprocalLikeB = await service.createLike(
      await createLikeInput(reciprocalB, reciprocalA),
    );
    await Promise.all([
      service.respondToLike({
        actorId: reciprocalB,
        likeId: reciprocalLikeA.likeId,
        agreements: [true, true, true],
        answers: ["reciprocal a1", "reciprocal a2"],
      }),
      service.respondToLike({
        actorId: reciprocalA,
        likeId: reciprocalLikeB.likeId,
        agreements: [true, true, true],
        answers: ["reciprocal b1", "reciprocal b2"],
      }),
    ]);
    const reciprocalAccepts = await Promise.all([
      service.acceptLike({
        actorId: reciprocalA,
        likeId: reciprocalLikeA.likeId,
      }),
      service.acceptLike({
        actorId: reciprocalB,
        likeId: reciprocalLikeB.likeId,
      }),
    ]);
    assert.equal(
      new Set(reciprocalAccepts.map((result) => result.connectionId)).size,
      1,
    );
    const reciprocalConnectionId = reciprocalAccepts[0]!.connectionId;
    const reciprocalConnection = await MatchingConnection.findById(
      reciprocalConnectionId,
    ).lean();
    assert.deepEqual(
      [...(reciprocalConnection?.sourceLikeIds ?? [])].sort(),
      [reciprocalLikeA.likeId, reciprocalLikeB.likeId].sort(),
    );

    await service.confirmConnection({
      actorId: reciprocalA,
      connectionId: reciprocalConnectionId,
      action: "REQUEST",
    });
    const confirmedConnection = await service.confirmConnection({
      actorId: reciprocalB,
      connectionId: reciprocalConnectionId,
      action: "CONFIRM",
    });
    assert.equal(confirmedConnection.stage, "COUPLE_CONFIRMED");
    assert.ok(confirmedConnection.pairId);
    const repeatedConfirmation = await service.confirmConnection({
      actorId: reciprocalB,
      connectionId: reciprocalConnectionId,
      action: "CONFIRM",
    });
    assert.equal(repeatedConfirmation.noop, true);
    assert.equal(repeatedConfirmation.pairId, confirmedConnection.pairId);
    assert.equal(
      await PairMembershipClaim.countDocuments({
        source: "MATCHING_CONNECTION",
        sourceId: reciprocalConnectionId,
      }),
      2,
    );
    assert.equal(
      await Pair.countDocuments({ _id: confirmedConnection.pairId }),
      1,
    );

    console.log("matching-idempotency-races.integration: ok");
  } finally {
    await cleanup();
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(
    `matching-idempotency-races.integration: failed (${error.name}: ${error.message})`,
  );
  process.exitCode = 1;
});
