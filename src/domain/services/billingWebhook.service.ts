import mongoose, { Types } from 'mongoose';
import { asError, DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import type { SandboxWebhookPayload } from '@/lib/billing/sandboxWebhook';
import { BillingWebhookEvent } from '@/models/BillingWebhookEvent';
import { Pair } from '@/models/Pair';
import { Subscription } from '@/models/Subscription';
import { recordProductAnalyticsEvent } from '@/lib/observability/productAnalytics';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';
import type { SubscriptionStatus } from '@/lib/entitlements/types';

type DuplicateKeyError = Error & { code?: number };

const isDuplicateKeyError = (error: Error): boolean =>
  (error as DuplicateKeyError).code === 11000;

type StoredSubscriptionOrder = {
  _id: Types.ObjectId;
  providerSubscriptionId?: string;
  providerIsCurrent?: boolean;
  providerEventVersion?: number;
  providerEventOccurredAt?: Date;
  providerLastEventId?: string;
  providerLastPayloadHash?: string;
  status?: SubscriptionStatus;
};

type IncomingProviderEventOrder = {
  subscriptionId: string;
  version: number;
  occurredAt: Date;
  eventId: string;
  payloadHash: string;
};

export type ProviderEventDisposition =
  | 'APPLY'
  | 'STALE'
  | 'EQUIVALENT'
  | 'CONFLICT';

const compareText = (left: string, right: string): number => {
  if (left === right) return 0;
  return left > right ? 1 : -1;
};

export const classifyProviderEvent = (input: {
  current: Pick<
    StoredSubscriptionOrder,
    'providerEventVersion' | 'providerEventOccurredAt' | 'providerLastPayloadHash'
  > | null;
  incoming: IncomingProviderEventOrder;
}): ProviderEventDisposition => {
  const currentVersion = input.current?.providerEventVersion;
  if (currentVersion === undefined) return 'APPLY';
  if (input.incoming.version < currentVersion) return 'STALE';

  const currentOccurredAt = input.current?.providerEventOccurredAt;
  if (input.incoming.version > currentVersion) {
    if (
      currentOccurredAt &&
      input.incoming.occurredAt.getTime() < currentOccurredAt.getTime()
    ) {
      return 'CONFLICT';
    }
    return 'APPLY';
  }

  if (
    !currentOccurredAt ||
    input.incoming.occurredAt.getTime() !== currentOccurredAt.getTime()
  ) {
    return 'CONFLICT';
  }
  return input.current?.providerLastPayloadHash === input.incoming.payloadHash
    ? 'EQUIVALENT'
    : 'CONFLICT';
};

export const compareProviderCurrentOrder = (
  incoming: IncomingProviderEventOrder,
  current: Pick<
    StoredSubscriptionOrder,
    | 'providerSubscriptionId'
    | 'providerEventVersion'
    | 'providerEventOccurredAt'
    | 'providerLastEventId'
  >
): number => {
  const currentOccurredAt = current.providerEventOccurredAt;
  if (!currentOccurredAt) return 1;
  const occurredAtDifference =
    incoming.occurredAt.getTime() - currentOccurredAt.getTime();
  if (occurredAtDifference !== 0) return occurredAtDifference;

  if (incoming.subscriptionId === current.providerSubscriptionId) {
    const versionDifference =
      incoming.version - (current.providerEventVersion ?? -1);
    if (versionDifference !== 0) return versionDifference;
  }

  const eventDifference = compareText(
    incoming.eventId,
    current.providerLastEventId ?? ''
  );
  if (eventDifference !== 0) return eventDifference;
  return compareText(
    incoming.subscriptionId,
    current.providerSubscriptionId ?? ''
  );
};

const existingResult = async (input: {
  eventId: string;
  payloadHash: string;
}): Promise<{ processed: true; duplicate: true } | null> => {
  const existing = await BillingWebhookEvent.findOne({
    provider: 'sandbox',
    eventId: input.eventId,
  })
    .select({ payloadHash: 1, status: 1 })
    .lean<{ payloadHash: string; status: 'RECEIVED' | 'PROCESSED' } | null>();
  if (!existing) return null;
  if (existing.payloadHash !== input.payloadHash) {
    throw new DomainError({
      code: 'WEBHOOK_EVENT_CONFLICT',
      status: 409,
      message: 'Webhook event is unavailable',
    });
  }
  if (existing.status !== 'PROCESSED') {
    throw new DomainError({
      code: 'WEBHOOK_EVENT_IN_PROGRESS',
      status: 409,
      message: 'Webhook event is unavailable',
    });
  }
  return { processed: true, duplicate: true };
};

export const billingWebhookService = {
  async processSandbox(input: {
    eventId: string;
    payloadHash: string;
    payload: SandboxWebhookPayload;
    now?: Date;
  }): Promise<{ processed: true; duplicate: boolean }> {
    await connectToDatabase();
    const duplicate = await existingResult(input);
    if (duplicate) return duplicate;

    const now = input.now ?? new Date();
    const providerOccurredAt = new Date(input.payload.occurredAt);
    const pairId = new Types.ObjectId(input.payload.pairId);
    const incomingOrder: IncomingProviderEventOrder = {
      subscriptionId: input.payload.subscriptionId,
      version: input.payload.version,
      occurredAt: providerOccurredAt,
      eventId: input.eventId,
      payloadHash: input.payloadHash,
    };
    let equivalent = false;
    let analyticsTransition:
      | 'subscription_started'
      | 'subscription_cancelled'
      | undefined;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        analyticsTransition = undefined;
        const pair = await Pair.findOne({
          _id: pairId,
          members: input.payload.billingOwnerUserId,
          status: { $in: ['active', 'paused'] },
        })
          .select({ _id: 1 })
          .session(session)
          .lean<{ _id: Types.ObjectId } | null>();
        if (!pair) {
          throw new DomainError({
            code: 'WEBHOOK_EVENT_REJECTED',
            status: 409,
            message: 'Webhook event is unavailable',
          });
        }

        await BillingWebhookEvent.create(
          [
            {
              provider: 'sandbox',
              eventId: input.eventId,
              payloadHash: input.payloadHash,
              pairId,
              providerSubscriptionId: input.payload.subscriptionId,
              providerEventVersion: input.payload.version,
              providerOccurredAt,
              status: 'RECEIVED',
              receivedAt: now,
            },
          ],
          { session }
        );

        const subscriptionIdentity = {
          pairId,
          provider: 'sandbox' as const,
          providerSubscriptionId: input.payload.subscriptionId,
        };
        const existingSubscription = await Subscription.findOne(
          subscriptionIdentity
        )
          .select({
            _id: 1,
            providerSubscriptionId: 1,
            providerIsCurrent: 1,
            providerEventVersion: 1,
            providerEventOccurredAt: 1,
            providerLastEventId: 1,
            providerLastPayloadHash: 1,
            status: 1,
          })
          .session(session)
          .lean<StoredSubscriptionOrder | null>();
        const disposition = classifyProviderEvent({
          current: existingSubscription,
          incoming: incomingOrder,
        });
        if (disposition === 'CONFLICT') {
          throw new DomainError({
            code: 'WEBHOOK_EVENT_ORDER_CONFLICT',
            status: 409,
            message: 'Webhook event is unavailable',
          });
        }

        if (disposition === 'APPLY') {
          const currentSubscription = await Subscription.findOne({
            pairId,
            provider: 'sandbox',
            providerIsCurrent: true,
          })
            .sort({
              providerEventOccurredAt: -1,
              providerEventVersion: -1,
              providerLastEventId: -1,
              providerSubscriptionId: -1,
            })
            .select({
              _id: 1,
              providerSubscriptionId: 1,
              providerIsCurrent: 1,
              providerEventVersion: 1,
              providerEventOccurredAt: 1,
              providerLastEventId: 1,
              providerLastPayloadHash: 1,
            })
            .session(session)
            .lean<StoredSubscriptionOrder | null>();
          const shouldBeCurrent =
            !currentSubscription ||
            currentSubscription.providerSubscriptionId ===
              input.payload.subscriptionId ||
            compareProviderCurrentOrder(incomingOrder, currentSubscription) > 0;

          if (shouldBeCurrent) {
            await Subscription.updateMany(
              {
                pairId,
                provider: 'sandbox',
                providerIsCurrent: true,
                providerSubscriptionId: { $ne: input.payload.subscriptionId },
              },
              { $set: { providerIsCurrent: false } },
              { session }
            );
          }

          const status =
            input.payload.eventType === 'subscription.deleted'
              ? 'expired'
              : input.payload.status;
          const subscriptionFields = {
            userId: input.payload.billingOwnerUserId,
            billingOwnerUserId: input.payload.billingOwnerUserId,
            pairId,
            provider: 'sandbox' as const,
            providerSubscriptionId: input.payload.subscriptionId,
            providerIsCurrent: shouldBeCurrent,
            providerEventVersion: input.payload.version,
            providerEventOccurredAt: providerOccurredAt,
            providerLastEventId: input.eventId,
            providerLastPayloadHash: input.payloadHash,
            providerLastEventType: input.payload.eventType,
            plan: input.payload.plan,
            status,
            ...(input.payload.periodEnd
              ? { periodEnd: new Date(input.payload.periodEnd) }
              : {}),
            meta: {
              source: 'sandbox_webhook',
              lastEventAt: now.toISOString(),
            },
          };

          if (existingSubscription) {
            const orderFilter =
              existingSubscription.providerEventVersion === undefined
                ? { providerEventVersion: { $exists: false } }
                : {
                    providerEventVersion:
                      existingSubscription.providerEventVersion,
                  };
            const updated = await Subscription.updateOne(
              { _id: existingSubscription._id, ...orderFilter },
              {
                $set: subscriptionFields,
                ...(input.payload.periodEnd ? {} : { $unset: { periodEnd: 1 } }),
              },
              { session }
            );
            if (updated.matchedCount !== 1) {
              throw new DomainError({
                code: 'WEBHOOK_EVENT_IN_PROGRESS',
                status: 409,
                message: 'Webhook event is unavailable',
              });
            }
          } else {
            await Subscription.create([subscriptionFields], { session });
          }
          const wasEntitled =
            existingSubscription?.status === 'active' ||
            existingSubscription?.status === 'trial' ||
            existingSubscription?.status === 'grace';
          const isEntitled =
            status === 'active' || status === 'trial' || status === 'grace';
          if (!wasEntitled && isEntitled) {
            analyticsTransition = 'subscription_started';
          } else if (wasEntitled && !isEntitled) {
            analyticsTransition = 'subscription_cancelled';
          }
        } else if (disposition === 'EQUIVALENT') {
          equivalent = true;
        }

        await BillingWebhookEvent.updateOne(
          { provider: 'sandbox', eventId: input.eventId, status: 'RECEIVED' },
          {
            $set: {
              status: 'PROCESSED',
              processedAt: now,
              outcome:
                disposition === 'APPLY'
                  ? 'APPLIED'
                  : disposition === 'STALE'
                    ? 'STALE'
                    : 'EQUIVALENT',
            },
          },
          { session }
        );
      });
      if (analyticsTransition === 'subscription_started') {
        recordProductAnalyticsEvent({
          name: 'subscription_started',
          technicalScope: 'subscription',
          at: now,
        });
      } else if (analyticsTransition === 'subscription_cancelled') {
        recordProductAnalyticsEvent({
          name: 'subscription_cancelled',
          technicalScope: 'subscription',
          at: now,
        });
      }
      return { processed: true, duplicate: equivalent };
    } catch (error) {
      const normalized = asError(error);
      if (isDuplicateKeyError(normalized)) {
        const concurrent = await existingResult(input);
        if (concurrent) return concurrent;
      }
      const code = normalized instanceof DomainError ? normalized.code : 'INTERNAL';
      if (code.includes('CONFLICT')) {
        recordOperationalEvent({
          name: 'conflict_observed',
          routeGroup: 'billing',
          outcome: 'conflict',
          code,
        });
      }
      recordOperationalEvent({
        name: 'webhook_failed',
        routeGroup: 'billing',
        outcome: code.includes('CONFLICT') ? 'conflict' : 'error',
        code,
      });
      throw normalized;
    } finally {
      await session.endSession();
    }
  },
};
