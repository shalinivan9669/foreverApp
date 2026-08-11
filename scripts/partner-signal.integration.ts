import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import mongoose from 'mongoose';
import { POST as postPartnerSignal } from '@/app/api/users/me/daily-checkins/[id]/partner-signal/route';
import {
  dailyCheckInIdempotencyPayload,
  type DailyCheckInBody,
} from '@/app/api/users/me/daily-checkins/request';
import { DomainError } from '@/domain/errors';
import { pairsService } from '@/domain/services/pairs.service';
import { partnerSignalService } from '@/domain/services/partnerSignal.service';
import { personalDailyCheckInService } from '@/domain/services/personalDailyCheckIn.service';
import { personalTodayService } from '@/domain/services/personalToday.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { signJwt } from '@/lib/jwt';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { IdempotencyRecord } from '@/models/IdempotencyRecord';
import { Pair } from '@/models/Pair';
import { PartnerSignal } from '@/models/PartnerSignal';
import { PersonalDailyCheckIn } from '@/models/PersonalDailyCheckIn';
import { SessionSubject } from '@/models/SessionSubject';
import { User } from '@/models/User';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const assertSafeTestUri = (uri: string): void => {
  const parsed = new URL(uri);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (parsed.protocol !== 'mongodb:') {
    throw new Error('Integration requires a mongodb:// URI');
  }
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '27018') {
    throw new Error('Integration is restricted to 127.0.0.1:27018');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('Integration requires a database ending in _test');
  }
  if (parsed.searchParams.get('directConnection') !== 'true') {
    throw new Error('Integration requires directConnection=true');
  }
};

assertSafeTestUri(mongodbUri);

const runId = randomUUID();
const ownerUserId = `signal-owner-${runId}`;
const receiverUserId = `signal-receiver-${runId}`;
const pairKey = [ownerUserId, receiverUserId].sort().join('|');
const signalText = `Мне нужна спокойная поддержка ${runId}`;
const dateKey = new Date().toISOString().slice(0, 10);
const jwtSecret = `${randomUUID()}${randomUUID()}`;
process.env.JWT_SECRET = jwtSecret;
const auditRequest = {
  route: '/integration/partner-signal',
  method: 'TEST',
  requestId: runId,
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

const deferred = (): Deferred => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const waitForGuard = async (
  guard: Promise<void>,
  operation: Promise<unknown>
): Promise<void> => {
  await Promise.race([
    guard,
    operation.then(
      () => {
        throw new Error('partner signal settled before lifecycle guard');
      },
      (error: unknown) => {
        throw new Error('partner signal failed before lifecycle guard', {
          cause: error,
        });
      }
    ),
  ]);
};

const userFixture = (id: string, username: string) => ({
  id,
  username,
  avatar: 'avatar',
  personal: {
    gender: 'female' as const,
    age: 30,
    city: 'Qyzylorda',
    relationshipStatus: 'in_relationship' as const,
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
  },
});

const answers = {
  mood: 'calm' as const,
  energy: 0.7,
  stress: 0.3,
  closenessNeed: 0.6,
  spaceNeed: 0.2,
  supportNeed: 0.8,
  conflictSensitivity: 0.2,
  conversationReadiness: 0.7,
};

const addUtcDays = (value: string, days: number): string =>
  new Date(new Date(`${value}T00:00:00.000Z`).getTime() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

const sendThroughRoute = async (input: {
  checkInId: string;
  text: string;
  idempotencyKey: string;
  bearerToken: string;
}): Promise<Response> =>
  postPartnerSignal(
    new Request(
      `https://app.example/api/users/me/daily-checkins/${input.checkInId}/partner-signal`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.bearerToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({ text: input.text }),
      }
    ) as NextRequest,
    { params: Promise.resolve({ id: input.checkInId }) }
  );

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });

  let pairId: mongoose.Types.ObjectId | null = null;
  try {
    await Promise.all([
      User.createIndexes(),
      Pair.createIndexes(),
      PersonalDailyCheckIn.createIndexes(),
      PartnerSignal.createIndexes(),
      IdempotencyRecord.createIndexes(),
      SessionSubject.createIndexes(),
    ]);

    await User.create([
      userFixture(ownerUserId, 'signal-owner'),
      userFixture(receiverUserId, 'signal-receiver'),
    ]);
    const pair = await Pair.create({
      members: [ownerUserId, receiverUserId],
      key: pairKey,
      status: 'active',
    });
    pairId = pair._id;

    await personalDailyCheckInService.submit({
      currentUserId: ownerUserId,
      dateKey,
      timezoneOffsetMin: 0,
      answers,
      privateJournal: { text: `owner-private-${runId}` },
      share: {
        partnerSignal: { enabled: true, text: signalText },
        pairMap: { enabled: false },
      },
    });

    const checkIn = await PersonalDailyCheckIn.findOne({
      userId: ownerUserId,
      dateKey,
    });
    assert.ok(checkIn, 'owner daily check-in was not persisted');
    assert.equal(checkIn.share.partnerSignal.status, 'draft');
    assert.equal(checkIn.share.partnerSignal.text, signalText);
    assert.equal(
      await PartnerSignal.countDocuments({ sourceCheckInId: checkIn._id }),
      0,
      'daily check-in created a signal without explicit send'
    );

    const first = await partnerSignalService.send({
      currentUserId: ownerUserId,
      checkInId: String(checkIn._id),
      text: signalText,
    });
    assert.equal(first.status, 'sent');
    assert.equal(
      await PartnerSignal.countDocuments({ sourceCheckInId: checkIn._id }),
      1
    );

    const sensitiveDailyBody: DailyCheckInBody = {
      dateKey,
      timezoneOffsetMin: 0,
      answers,
      context: {
        body: {
          enabled: true,
          type: 'other',
          note: 'body-a',
          visibility: 'private',
        },
        customTags: ['tag-a'],
      },
      privateJournal: { text: 'journal-a' },
      share: {
        partnerSignal: { enabled: true, text: 'signal-a' },
        pairMap: { enabled: false },
      },
    };
    const sensitiveFingerprint = dailyCheckInIdempotencyPayload(sensitiveDailyBody);
    const sameLengthVariants: DailyCheckInBody[] = [
      {
        ...sensitiveDailyBody,
        context: {
          ...sensitiveDailyBody.context,
          body: {
            enabled: true,
            type: 'other',
            note: 'body-b',
            visibility: 'private',
          },
        },
      },
      {
        ...sensitiveDailyBody,
        context: { ...sensitiveDailyBody.context, customTags: ['tag-b'] },
      },
      { ...sensitiveDailyBody, privateJournal: { text: 'journal-b' } },
      {
        ...sensitiveDailyBody,
        share: {
          ...sensitiveDailyBody.share,
          partnerSignal: { enabled: true, text: 'signal-b' },
        },
      },
    ];
    for (const variant of sameLengthVariants) {
      assert.notEqual(
        dailyCheckInIdempotencyPayload(variant).payloadDigest,
        sensitiveFingerprint.payloadDigest,
        'same-length sensitive daily content reused an idempotency fingerprint'
      );
    }
    assert.equal(
      ['body-a', 'tag-a', 'journal-a', 'signal-a'].some((value) =>
        JSON.stringify(sensitiveFingerprint).includes(value)
      ),
      false,
      'daily idempotency payload retained sensitive source text'
    );

    const routeDateKey = addUtcDays(dateKey, 2);
    await personalDailyCheckInService.submit({
      currentUserId: ownerUserId,
      dateKey: routeDateKey,
      timezoneOffsetMin: 0,
      answers,
      share: {
        partnerSignal: { enabled: true, text: 'need calm' },
        pairMap: { enabled: false },
      },
    });
    const routeCheckIn = await PersonalDailyCheckIn.findOne({
      userId: ownerUserId,
      dateKey: routeDateKey,
    });
    assert.ok(routeCheckIn, 'route idempotency check-in was not persisted');
    const routeIdempotencyKey = randomUUID();
    const sessionVersion = await sessionRevocationService.getOrCreateVersion(ownerUserId);
    const bearerToken = signJwt(ownerUserId, jwtSecret, 600, sessionVersion);
    const firstRouteResponse = await sendThroughRoute({
      checkInId: String(routeCheckIn._id),
      text: '  need calm  ',
      idempotencyKey: routeIdempotencyKey,
      bearerToken,
    });
    assert.equal(firstRouteResponse.status, 200);
    const sameContentReplay = await sendThroughRoute({
      checkInId: String(routeCheckIn._id),
      text: 'need calm',
      idempotencyKey: routeIdempotencyKey,
      bearerToken,
    });
    assert.equal(sameContentReplay.status, 200);
    assert.equal('need calm'.length, 'need time'.length);
    const changedContentReplay = await sendThroughRoute({
      checkInId: String(routeCheckIn._id),
      text: 'need time',
      idempotencyKey: routeIdempotencyKey,
      bearerToken,
    });
    assert.equal(changedContentReplay.status, 409);
    const changedContentEnvelope = (await changedContentReplay.json()) as {
      error?: { code?: string };
    };
    assert.equal(
      changedContentEnvelope.error?.code,
      'IDEMPOTENCY_KEY_REUSE_CONFLICT'
    );
    const routeSignal = await PartnerSignal.findOne({
      sourceCheckInId: routeCheckIn._id,
    }).lean();
    assert.equal(routeSignal?.text, 'need calm');
    assert.equal(
      await PartnerSignal.countDocuments({ sourceCheckInId: routeCheckIn._id }),
      1
    );
    const idempotencyRecord = await IdempotencyRecord.findOne({
      key: routeIdempotencyKey,
      userId: ownerUserId,
    }).lean();
    assert.match(idempotencyRecord?.requestHash ?? '', /^[0-9a-f]{64}$/);
    const storedIdempotencyRecord = JSON.stringify(idempotencyRecord);
    assert.equal(storedIdempotencyRecord.includes('need calm'), false);
    assert.equal(storedIdempotencyRecord.includes('need time'), false);
    assert.ok(routeSignal, 'route send did not persist PartnerSignal');
    await PartnerSignal.updateOne(
      { _id: routeSignal._id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } }
    );

    const firstSignal = await PartnerSignal.findById(first.id).lean();
    assert.ok(firstSignal, 'explicit send did not persist PartnerSignal');
    assert.ok(firstSignal.pairId instanceof mongoose.Types.ObjectId);
    assert.ok(firstSignal.sourceCheckInId instanceof mongoose.Types.ObjectId);
    assert.ok(firstSignal.expiresAt > firstSignal.createdAt);

    const retry = await partnerSignalService.send({
      currentUserId: ownerUserId,
      checkInId: String(checkIn._id),
      text: signalText,
    });
    assert.equal(retry.id, first.id);
    assert.equal(retry.sentAt, first.sentAt);
    assert.equal(
      await PartnerSignal.countDocuments({ sourceCheckInId: checkIn._id }),
      1
    );

    await assert.rejects(
      () =>
        partnerSignalService.send({
          currentUserId: ownerUserId,
          checkInId: String(checkIn._id),
          text: `${signalText} — другой текст`,
        }),
      (error: Error) =>
        error instanceof DomainError &&
        error.code === 'PARTNER_SIGNAL_ALREADY_SENT' &&
        error.status === 409
    );
    assert.equal(
      await PartnerSignal.countDocuments({ sourceCheckInId: checkIn._id }),
      1
    );

    const receiverToday = await personalTodayService.build({
      currentUserId: receiverUserId,
      dateKey,
      timezoneOffsetMin: 0,
    });
    assert.equal(receiverToday.incomingPartnerSignal?.id, first.id);
    assert.equal(receiverToday.incomingPartnerSignal?.text, signalText);

    await PartnerSignal.updateOne(
      { _id: firstSignal._id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } }
    );
    const receiverAfterExpiry = await personalTodayService.build({
      currentUserId: receiverUserId,
      dateKey,
      timezoneOffsetMin: 0,
    });
    assert.equal(receiverAfterExpiry.incomingPartnerSignal, undefined);

    await PartnerSignal.updateOne(
      { _id: firstSignal._id },
      { $set: { expiresAt: new Date(Date.now() + 60_000) } }
    );
    assert.equal(await PartnerSignal.countDocuments({ _id: firstSignal._id }), 1);

    const nextDateKey = addUtcDays(dateKey, 1);
    const raceSignalText = `Мне нужна пауза ${runId}`;
    await personalDailyCheckInService.submit({
      currentUserId: ownerUserId,
      dateKey: nextDateKey,
      timezoneOffsetMin: 0,
      answers,
      share: {
        partnerSignal: { enabled: true, text: raceSignalText },
        pairMap: { enabled: false },
      },
    });
    const raceCheckIn = await PersonalDailyCheckIn.findOne({
      userId: ownerUserId,
      dateKey: nextDateKey,
    });
    assert.ok(raceCheckIn, 'partner signal race check-in was not persisted');
    const guardReached = deferred();
    const releaseGuard = deferred();
    const staleSend = partnerSignalService.send(
      {
        currentUserId: ownerUserId,
        checkInId: String(raceCheckIn._id),
        text: raceSignalText,
      },
      {
        beforeTransactionalPairGuard: async () => {
          guardReached.resolve();
          await releaseGuard.promise;
        },
      }
    );
    await waitForGuard(guardReached.promise, staleSend);
    try {
      await pairsService.endPair({
        pairId: String(pair._id),
        currentUserId: ownerUserId,
        reason: 'MEMBER_REQUEST',
        auditRequest,
      });
    } finally {
      releaseGuard.resolve();
    }
    await assert.rejects(
      staleSend,
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'STATE_CONFLICT' &&
        error.status === 409
    );
    assert.equal(await PartnerSignal.countDocuments({ pairId: pair._id }), 0);
    assert.equal(
      (
        await PersonalDailyCheckIn.findById(raceCheckIn._id)
          .select({ 'share.partnerSignal.status': 1 })
          .lean()
      )?.share.partnerSignal.status,
      'draft',
      'stale send marked the source as sent after pair end'
    );
    assert.equal((await Pair.findById(pair._id).lean())?.status, 'ended');

    console.log('partner signal integration passed');
  } finally {
    await Promise.all([
      PartnerSignal.deleteMany({
        $or: [
          { fromUserId: ownerUserId },
          { toUserId: receiverUserId },
          ...(pairId ? [{ pairId }] : []),
        ],
      }),
      PersonalDailyCheckIn.deleteMany({
        userId: { $in: [ownerUserId, receiverUserId] },
      }),
      IdempotencyRecord.deleteMany({ userId: ownerUserId }),
      SessionSubject.deleteMany({
        subjectKey: privacySubjectHash(ownerUserId),
      }),
      Pair.deleteMany({ key: pairKey }),
      User.deleteMany({ id: { $in: [ownerUserId, receiverUserId] } }),
      mongoose.connection.db?.collection('event_logs').deleteMany({
        $or: [
          { 'actor.userId': { $in: [ownerUserId, receiverUserId] } },
          ...(pairId ? [{ 'context.pairId': String(pairId) }] : []),
        ],
      }),
    ]);
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
