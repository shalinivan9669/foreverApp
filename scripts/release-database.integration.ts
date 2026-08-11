import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { billingWebhookService } from '@/domain/services/billingWebhook.service';
import { notificationService } from '@/domain/services/notification.service';
import { hashSandboxWebhookPayload } from '@/lib/billing/sandboxWebhook';
import { resolveEntitlements } from '@/lib/entitlements/resolve';
import { BillingWebhookEvent } from '@/models/BillingWebhookEvent';
import { Notification } from '@/models/Notification';
import { Pair } from '@/models/Pair';
import { Subscription } from '@/models/Subscription';
import { WeeklyCycle } from '@/models/WeeklyCycle';
import { cycleEntitlementService } from '@/domain/services/cycleEntitlement.service';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');
const databaseName = new URL(mongodbUri).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Integration test requires a database name ending in _test');
}

const runId = randomUUID();
const memberA = `integration-a-${runId}`;
const memberB = `integration-b-${runId}`;
const pairKey = [memberA, memberB].sort().join('|');
const eventId = `integration-event-${runId}`;
const deletedEventId = `${eventId}-deleted`;
const subscriptionId = `integration-subscription-${runId}`;

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
      Notification.createIndexes(),
    ]);

    const pair = await Pair.create({
      members: [memberA, memberB],
      key: pairKey,
      status: 'active',
    });
    pairId = String(pair._id);

    await WeeklyCycle.create({
      pairId: pair._id,
      cycleKey: '2026-W31',
      startsAt: new Date('2026-07-27T00:00:00.000Z'),
      endsAt: new Date('2026-08-03T00:00:00.000Z'),
      expiresAt: new Date('2026-08-03T00:00:00.000Z'),
      timeZone: 'UTC',
      status: 'EXPIRED',
      memberIds: [memberA, memberB].sort(),
      memberCompletion: [
        { userId: [memberA, memberB].sort()[0], status: 'SUBMITTED' },
        { userId: [memberA, memberB].sort()[1], status: 'SUBMITTED' },
      ],
      pairReadiness: 'ENOUGH',
      submissionCount: 2,
      submissionClaims: [],
      inputDefinitionVersion: 'weekly-checkin-v1',
      algorithmVersion: 'pair-state-v1',
      latestSnapshotId: new mongoose.Types.ObjectId(),
      latestSnapshotRevision: 0,
    });

    assert.deepEqual(
      await cycleEntitlementService.assertCanOpen({
        pairId,
        currentUserId: memberA,
        cycleKey: '2026-W32',
        billingMode: 'sandbox',
      }),
      { allowed: true, reason: 'FREE_CORE' }
    );

    const rawBody = JSON.stringify({
      eventType: 'subscription.updated',
      subscriptionId,
      pairId,
      billingOwnerUserId: memberA,
      plan: 'COUPLE',
      status: 'trial',
      periodEnd: '2099-08-21T12:00:00.000Z',
      version: 1,
      occurredAt: '2026-08-07T11:00:00.000Z',
    });
    const payload = {
      eventType: 'subscription.updated' as const,
      subscriptionId,
      pairId,
      billingOwnerUserId: memberA,
      plan: 'COUPLE' as const,
      status: 'trial' as const,
      periodEnd: '2099-08-21T12:00:00.000Z',
      version: 1,
      occurredAt: '2026-08-07T11:00:00.000Z',
    };
    const payloadHash = hashSandboxWebhookPayload(rawBody);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        billingWebhookService.processSandbox({
          eventId,
          payloadHash,
          payload,
          now: new Date('2026-08-07T12:00:00.000Z'),
        })
      )
    );
    assert.equal(results.filter((result) => !result.duplicate).length, 1);
    assert.equal(results.filter((result) => result.duplicate).length, 7);
    assert.equal(
      await BillingWebhookEvent.countDocuments({ provider: 'sandbox', eventId }),
      1
    );
    assert.equal(
      await Subscription.countDocuments({
        pairId: pair._id,
        providerSubscriptionId: subscriptionId,
      }),
      1
    );

    const entitlementA = await resolveEntitlements({
      currentUserId: memberA,
      pairId,
    });
    const entitlementB = await resolveEntitlements({
      currentUserId: memberB,
      pairId,
    });
    assert.equal(entitlementA.plan, 'COUPLE');
    assert.equal(entitlementB.plan, 'COUPLE');
    assert.equal(entitlementA.source, 'pair_subscription');
    assert.equal(entitlementB.source, 'pair_subscription');
    assert.deepEqual(
      await cycleEntitlementService.assertCanOpen({
        pairId,
        currentUserId: memberB,
        cycleKey: '2026-W32',
        billingMode: 'sandbox',
      }),
      { allowed: true, reason: 'FREE_CORE' }
    );

    await assert.rejects(
      () =>
        billingWebhookService.processSandbox({
          eventId,
          payloadHash: 'f'.repeat(64),
          payload,
        }),
      (error: Error) =>
        error instanceof DomainError && error.code === 'WEBHOOK_EVENT_CONFLICT'
    );

    const deletedRawBody = JSON.stringify({
      eventType: 'subscription.deleted',
      subscriptionId,
      pairId,
      billingOwnerUserId: memberA,
      plan: 'COUPLE',
      status: 'expired',
      version: 2,
      occurredAt: '2026-08-07T13:00:00.000Z',
    });
    await billingWebhookService.processSandbox({
      eventId: deletedEventId,
      payloadHash: hashSandboxWebhookPayload(deletedRawBody),
      payload: {
        eventType: 'subscription.deleted',
        subscriptionId,
        pairId,
        billingOwnerUserId: memberA,
        plan: 'COUPLE',
        status: 'expired',
        version: 2,
        occurredAt: '2026-08-07T13:00:00.000Z',
      },
    });
    assert.deepEqual(
      await cycleEntitlementService.assertCanOpen({
        pairId,
        currentUserId: memberA,
        cycleKey: '2026-W32',
        billingMode: 'sandbox',
      }),
      { allowed: true, reason: 'FREE_CORE' }
    );

    await Promise.all([
      notificationService.create({
        userIds: [memberA, memberB],
        pairId,
        type: 'SUMMARY_READY',
        sourceKey: 'cycle-1',
      }),
      notificationService.create({
        userIds: [memberA, memberB],
        pairId,
        type: 'SUMMARY_READY',
        sourceKey: 'cycle-1',
      }),
    ]);
    const pageA = await notificationService.list({ currentUserId: memberA });
    const pageB = await notificationService.list({ currentUserId: memberB });
    assert.equal(pageA.items.length, 1);
    assert.equal(pageB.items.length, 1);
    assert.equal(pageA.unreadCount, 1);

    const read = await notificationService.markRead({
      currentUserId: memberA,
      notificationId: pageA.items[0].id,
    });
    assert.equal(read.isRead, true);
    await assert.rejects(
      () =>
        notificationService.markRead({
          currentUserId: memberB,
          notificationId: pageA.items[0].id,
        }),
      (error: Error) => error instanceof DomainError && error.status === 404
    );

    console.log('release database integration passed');
  } finally {
    if (pairId) {
      await Promise.all([
        Notification.deleteMany({ userId: { $in: [memberA, memberB] } }),
        BillingWebhookEvent.deleteMany({ eventId: { $in: [eventId, deletedEventId] } }),
        Subscription.deleteMany({ providerSubscriptionId: subscriptionId }),
        WeeklyCycle.deleteMany({ pairId }),
        Pair.deleteOne({ _id: pairId, key: pairKey }),
      ]);
    }
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
