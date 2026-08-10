import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { matchService } from '@/domain/services/match.service';
import { EventLog } from '@/models/EventLog';
import { Like } from '@/models/Like';
import { User } from '@/models/User';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const databaseName = new URL(mongodbUri).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Like idempotency integration requires a database ending in _test');
}

const runId = randomUUID();
const fromId = `like-idempotency-from-${runId}`;
const toId = `like-idempotency-to-${runId}`;
const legacyFromId = `like-idempotency-legacy-from-${runId}`;
const legacyToId = `like-idempotency-legacy-to-${runId}`;

const userFixture = (id: string, withMatchCard: boolean) => ({
  id,
  username: id,
  avatar: 'avatar',
  personal: {
    gender: 'female' as const,
    age: 30,
    city: 'Qyzylorda',
    relationshipStatus: 'seeking' as const,
  },
  vectors: {},
  preferences: {
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 50,
  },
  profile: {
    onboarding: {
      seeking: {
        valuedQualities: ['kindness', 'honesty', 'respect'],
        relationshipPriority: 'emotional_intimacy' as const,
        minExperience: 'none' as const,
        dealBreakers: 'none',
        firstDateSetting: 'cafe' as const,
        weeklyTimeCommitment: '5-10h' as const,
      },
    },
    ...(withMatchCard
      ? {
          matchCard: {
            requirements: ['kindness', 'honesty', 'respect'],
            give: ['support', 'attention', 'care'],
            questions: ['What matters?', 'How do you rest?'],
            isActive: true,
          },
        }
      : {}),
  },
});

const createInput = (idempotencyKey: string, firstAnswer = 'answer-a') => ({
  currentUserId: fromId,
  toId,
  agreements: [true, true, true] as [true, true, true],
  answers: [firstAnswer, 'answer-b'] as [string, string],
  idempotencyKey,
  auditRequest: { route: '/api/match/like', method: 'TEST' },
});

const main = async (): Promise<void> => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    await Like.create([
      {
        fromId: legacyFromId,
        toId: legacyToId,
        matchScore: 0,
        status: 'sent',
      },
      {
        fromId: legacyFromId,
        toId: legacyToId,
        matchScore: 0,
        status: 'sent',
      },
    ]);
    await Like.createIndexes();
    assert.equal(await Like.countDocuments({ fromId: legacyFromId }), 2);

    await User.create([
      userFixture(fromId, true),
      userFixture(toId, false),
    ]);

    const sequentialKey = randomUUID();
    const first = await matchService.createLike(createInput(sequentialKey));
    const replay = await matchService.createLike(createInput(sequentialKey));
    assert.equal(replay.id, first.id);

    const concurrentKey = randomUUID();
    const concurrent = await Promise.all([
      matchService.createLike(createInput(concurrentKey)),
      matchService.createLike(createInput(concurrentKey)),
    ]);
    assert.equal(concurrent[0].id, concurrent[1].id);

    await assert.rejects(
      () => matchService.createLike(createInput(sequentialKey, 'changed-answer')),
      (error) =>
        error instanceof DomainError &&
        error.status === 409 &&
        error.code === 'IDEMPOTENCY_KEY_REUSE_CONFLICT'
    );

    const storedLikes = await Like.find({ fromId })
      .select({ _id: 1, creationKeyHash: 1, creationRequestHash: 1 })
      .lean();
    assert.equal(storedLikes.length, 2);

    for (const like of storedLikes) {
      assert.match(like.creationKeyHash ?? '', /^[a-f0-9]{64}$/);
      assert.match(like.creationRequestHash ?? '', /^[a-f0-9]{64}$/);
      assert.notEqual(like.creationKeyHash, sequentialKey);
      assert.notEqual(like.creationKeyHash, concurrentKey);
    }

    const auditCount = await EventLog.countDocuments({
      event: 'MATCH_LIKE_CREATED',
      'actor.userId': fromId,
    });
    assert.equal(auditCount, 2);

    console.log('like idempotency integration passed');
  } finally {
    await Promise.all([
      EventLog.deleteMany({ 'actor.userId': fromId }),
      Like.deleteMany({ fromId: { $in: [fromId, legacyFromId] } }),
      User.deleteMany({ id: { $in: [fromId, toId] } }),
    ]);
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
