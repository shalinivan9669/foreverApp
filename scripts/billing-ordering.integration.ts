import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { billingWebhookService } from '@/domain/services/billingWebhook.service';
import {
  hashSandboxWebhookPayload,
  type SandboxWebhookPayload,
} from '@/lib/billing/sandboxWebhook';
import { resolveEntitlements } from '@/lib/entitlements/resolve';
import { BillingWebhookEvent } from '@/models/BillingWebhookEvent';
import { Pair } from '@/models/Pair';
import { Subscription } from '@/models/Subscription';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');
const databaseName = new URL(mongodbUri).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Integration test requires a database name ending in _test');
}

const runId = randomUUID();
const memberA = `billing-order-a-${runId}`;
const memberB = `billing-order-b-${runId}`;
const legacyUser = `billing-order-legacy-${runId}`;
const pairKey = [memberA, memberB].sort().join('|');
const eventPrefix = `billing-order-event-${runId}`;
const subscriptionA = `billing-order-sub-a-${runId}`;
const subscriptionB = `billing-order-sub-b-${runId}`;

const processEvent = async (
  eventId: string,
  payload: SandboxWebhookPayload
): ReturnType<typeof billingWebhookService.processSandbox> => {
  const rawBody = JSON.stringify(payload);
  return billingWebhookService.processSandbox({
    eventId,
    payloadHash: hashSandboxWebhookPayload(rawBody),
    payload,
    now: new Date('2026-08-07T12:30:00.000Z'),
  });
};

const payload = (input: {
  eventType: SandboxWebhookPayload['eventType'];
  occurredAt: string;
  version: number;
  subscriptionId: string;
  status: SandboxWebhookPayload['status'];
  pairId: string;
}): SandboxWebhookPayload => ({
  eventType: input.eventType,
  occurredAt: input.occurredAt,
  version: input.version,
  subscriptionId: input.subscriptionId,
  pairId: input.pairId,
  billingOwnerUserId: memberA,
  plan: 'COUPLE',
  status: input.status,
  ...(input.eventType === 'subscription.updated'
    ? { periodEnd: '2099-08-21T12:00:00.000Z' }
    : {}),
});

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });

  let pairId = '';
  try {
    await Promise.all([
      Pair.createIndexes(),
      Subscription.createIndexes(),
      BillingWebhookEvent.createIndexes(),
    ]);
    const pair = await Pair.create({
      members: [memberA, memberB],
      key: pairKey,
      status: 'active',
    });
    pairId = String(pair._id);

    const activeA = payload({
      eventType: 'subscription.updated',
      occurredAt: '2026-08-07T12:00:00.000Z',
      version: 1,
      subscriptionId: subscriptionA,
      status: 'active',
      pairId,
    });
    const initialResults = await Promise.all(
      Array.from({ length: 4 }, () =>
        processEvent(`${eventPrefix}-a-active`, activeA)
      )
    );
    assert.equal(initialResults.filter((result) => !result.duplicate).length, 1);
    assert.equal(initialResults.filter((result) => result.duplicate).length, 3);

    const deletedA = payload({
      eventType: 'subscription.deleted',
      occurredAt: '2026-08-07T12:10:00.000Z',
      version: 3,
      subscriptionId: subscriptionA,
      status: 'expired',
      pairId,
    });
    await processEvent(`${eventPrefix}-a-deleted`, deletedA);

    const olderActiveA = payload({
      eventType: 'subscription.updated',
      occurredAt: '2026-08-07T12:05:00.000Z',
      version: 2,
      subscriptionId: subscriptionA,
      status: 'active',
      pairId,
    });
    await processEvent(`${eventPrefix}-a-older-active`, olderActiveA);
    const afterStale = await Subscription.findOne({
      pairId: pair._id,
      providerSubscriptionId: subscriptionA,
    }).lean();
    assert.equal(afterStale?.status, 'expired');
    assert.equal(afterStale?.providerEventVersion, 3);
    const staleEvent = await BillingWebhookEvent.findOne({
      eventId: `${eventPrefix}-a-older-active`,
    })
      .select({ outcome: 1 })
      .lean<{ outcome?: string } | null>();
    assert.equal(staleEvent?.outcome, 'STALE');

    const equivalent = await processEvent(
      `${eventPrefix}-a-deleted-alias`,
      deletedA
    );
    assert.equal(equivalent.duplicate, true);

    const conflictingSameVersion = payload({
      eventType: 'subscription.updated',
      occurredAt: '2026-08-07T12:10:00.000Z',
      version: 3,
      subscriptionId: subscriptionA,
      status: 'active',
      pairId,
    });
    await assert.rejects(
      () =>
        processEvent(
          `${eventPrefix}-a-conflicting-version`,
          conflictingSameVersion
        ),
      (error: Error) =>
        error instanceof DomainError &&
        error.code === 'WEBHOOK_EVENT_ORDER_CONFLICT'
    );

    const activeB = payload({
      eventType: 'subscription.updated',
      occurredAt: '2026-08-07T12:15:00.000Z',
      version: 1,
      subscriptionId: subscriptionB,
      status: 'active',
      pairId,
    });
    await processEvent(`${eventPrefix}-b-active`, activeB);
    const deletedB = payload({
      eventType: 'subscription.deleted',
      occurredAt: '2026-08-07T12:20:00.000Z',
      version: 2,
      subscriptionId: subscriptionB,
      status: 'expired',
      pairId,
    });
    await processEvent(`${eventPrefix}-b-deleted`, deletedB);

    const newerButNotCurrentA = payload({
      eventType: 'subscription.updated',
      occurredAt: '2026-08-07T12:18:00.000Z',
      version: 4,
      subscriptionId: subscriptionA,
      status: 'active',
      pairId,
    });
    await processEvent(`${eventPrefix}-a-noncurrent-active`, newerButNotCurrentA);
    assert.equal(
      await Subscription.countDocuments({
        pairId: pair._id,
        provider: 'sandbox',
        providerIsCurrent: true,
      }),
      1
    );
    const current = await Subscription.findOne({
      pairId: pair._id,
      provider: 'sandbox',
      providerIsCurrent: true,
    }).lean();
    assert.equal(current?.providerSubscriptionId, subscriptionB);
    assert.equal(current?.status, 'expired');
    const pairEntitlements = await resolveEntitlements({
      currentUserId: memberA,
      pairId,
    });
    assert.equal(pairEntitlements.plan, 'FREE');
    assert.equal(pairEntitlements.source, 'default_free');

    await Subscription.create({
      userId: legacyUser,
      plan: 'SOLO',
      status: 'active',
      periodEnd: new Date('2099-08-21T12:00:00.000Z'),
    });
    await Subscription.insertMany(
      Array.from({ length: 25 }, (_, index) => ({
        userId: legacyUser,
        plan: 'FREE' as const,
        status: 'expired' as const,
        meta: { source: `expired-fixture-${index}` },
      }))
    );
    const legacyEntitlements = await resolveEntitlements({
      currentUserId: legacyUser,
    });
    assert.equal(legacyEntitlements.plan, 'SOLO');
    assert.equal(legacyEntitlements.status, 'active');
    assert.equal(legacyEntitlements.source, 'legacy_user_subscription');

    console.log('billing ordering integration passed');
  } finally {
    await Promise.all([
      BillingWebhookEvent.deleteMany({ eventId: { $regex: `^${eventPrefix}` } }),
      Subscription.deleteMany({
        $or: [
          { providerSubscriptionId: { $in: [subscriptionA, subscriptionB] } },
          { userId: legacyUser },
        ],
      }),
      pairId ? Pair.deleteOne({ _id: pairId, key: pairKey }) : Promise.resolve(),
    ]);
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
