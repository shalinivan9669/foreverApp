import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { connectToDatabase } from '../src/lib/mongodb';
import {
  requireActivityMember,
  requireLikeParticipant,
  requirePairMember,
  type ResourceGuardResult,
} from '../src/lib/auth/resourceGuards';
import { Pair } from '../src/models/Pair';
import { PairActivity } from '../src/models/PairActivity';
import { Like } from '../src/models/Like';

type DenialEnvelope = {
  status: number;
  body: string;
};

const requireGuardedTestDatabase = (): string => {
  const uri = process.env.MONGODB_URI?.trim();
  assert.ok(uri, 'MONGODB_URI is required');

  const databaseName = new URL(uri).pathname.replace(/^\//, '');
  assert.match(
    databaseName,
    /_test$/,
    'refusing to run destructive resource-guard integration outside an *_test database'
  );
  return databaseName;
};

const denialEnvelope = async <T>(
  result: ResourceGuardResult<T>
): Promise<DenialEnvelope> => {
  assert.equal(result.ok, false, 'expected the resource guard to deny access');
  if (result.ok) throw new Error('resource guard unexpectedly allowed access');

  return {
    status: result.response.status,
    body: await result.response.text(),
  };
};

const run = async (): Promise<void> => {
  const databaseName = requireGuardedTestDatabase();
  await connectToDatabase();
  assert.equal(mongoose.connection.name, databaseName);

  const db = mongoose.connection.db;
  assert.ok(db, 'Mongo database connection is unavailable');
  await db.dropDatabase();

  const memberA = 'resource-guard-member-a';
  const memberB = 'resource-guard-member-b';
  const foreignA = 'resource-guard-foreign-a';
  const foreignB = 'resource-guard-foreign-b';

  try {
    const [ownedPair, foreignPair] = await Pair.create([
      {
        members: [memberA, memberB],
        key: `${memberA}|${memberB}`,
        status: 'active',
        contextVersion: 'pair-context-v1',
      },
      {
        members: [foreignA, foreignB],
        key: `${foreignA}|${foreignB}`,
        status: 'active',
        contextVersion: 'pair-context-v1',
      },
    ]);

    const [ownedActivity, foreignActivity] = await PairActivity.create([
      {
        pairId: ownedPair._id,
        members: [new Types.ObjectId(), new Types.ObjectId()],
        intent: 'improve',
        archetype: 'task',
        actionDefinition: {
          key: 'resource-guard-test',
          actionVersion: 1,
          registryVersion: 1,
        },
        targetFactorKeys: ['resource_guard_test'],
        title: { ru: 'Проверка', en: 'Test' },
        why: { ru: 'Проверка', en: 'Test' },
        mode: 'together',
        sync: 'sync',
        difficulty: 1,
        intensity: 1,
        offeredAt: new Date(),
        status: 'offered',
        checkIns: [],
        createdBy: 'system',
      },
      {
        pairId: foreignPair._id,
        members: [new Types.ObjectId(), new Types.ObjectId()],
        intent: 'improve',
        archetype: 'task',
        actionDefinition: {
          key: 'resource-guard-test',
          actionVersion: 1,
          registryVersion: 1,
        },
        targetFactorKeys: ['resource_guard_test'],
        title: { ru: 'Проверка', en: 'Test' },
        why: { ru: 'Проверка', en: 'Test' },
        mode: 'together',
        sync: 'sync',
        difficulty: 1,
        intensity: 1,
        offeredAt: new Date(),
        status: 'offered',
        checkIns: [],
        createdBy: 'system',
      },
    ]);

    const [ownedLike, foreignLike] = await Like.create([
      {
        fromId: memberA,
        toId: memberB,
        matchScore: 0,
        status: 'sent',
      },
      {
        fromId: foreignA,
        toId: foreignB,
        matchScore: 0,
        status: 'sent',
      },
    ]);

    const ownedPairGuard = await requirePairMember(String(ownedPair._id), memberA);
    assert.equal(ownedPairGuard.ok, true);
    if (ownedPairGuard.ok) assert.equal(ownedPairGuard.data.by, 'A');

    const missingPairDenial = await denialEnvelope(
      await requirePairMember(String(new Types.ObjectId()), memberA)
    );
    const foreignPairDenial = await denialEnvelope(
      await requirePairMember(String(foreignPair._id), memberA)
    );
    const invalidPairDenial = await denialEnvelope(
      await requirePairMember('not-an-object-id', memberA)
    );
    assert.deepEqual(foreignPairDenial, missingPairDenial);
    assert.deepEqual(invalidPairDenial, missingPairDenial);

    const ownedActivityGuard = await requireActivityMember(
      String(ownedActivity._id),
      memberA
    );
    assert.equal(ownedActivityGuard.ok, true);

    const missingActivityDenial = await denialEnvelope(
      await requireActivityMember(String(new Types.ObjectId()), memberA)
    );
    const foreignActivityDenial = await denialEnvelope(
      await requireActivityMember(String(foreignActivity._id), memberA)
    );
    const invalidActivityDenial = await denialEnvelope(
      await requireActivityMember('not-an-object-id', memberA)
    );
    assert.deepEqual(foreignActivityDenial, missingActivityDenial);
    assert.deepEqual(invalidActivityDenial, missingActivityDenial);

    const ownedLikeGuard = await requireLikeParticipant(String(ownedLike._id), memberA);
    assert.equal(ownedLikeGuard.ok, true);
    if (ownedLikeGuard.ok) assert.equal(ownedLikeGuard.data.role, 'from');

    const missingLikeDenial = await denialEnvelope(
      await requireLikeParticipant(String(new Types.ObjectId()), memberA)
    );
    const foreignLikeDenial = await denialEnvelope(
      await requireLikeParticipant(String(foreignLike._id), memberA)
    );
    const invalidLikeDenial = await denialEnvelope(
      await requireLikeParticipant('not-an-object-id', memberA)
    );
    assert.deepEqual(foreignLikeDenial, missingLikeDenial);
    assert.deepEqual(invalidLikeDenial, missingLikeDenial);

    console.log('Resource guard nondisclosure integration passed.');
  } finally {
    await db.dropDatabase();
    await mongoose.disconnect();
  }
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
