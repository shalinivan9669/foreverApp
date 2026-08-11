import { DomainError } from '@/domain/errors';
import {
  AccountWriteBarrierError,
  accountWriteBarrierService,
  type AccountWriteLease,
} from '@/domain/services/accountWriteBarrier.service';
import { connectToDatabase } from '@/lib/mongodb';
import { Subscription } from '@/models/Subscription';
import { User } from '@/models/User';
import { emitEvent } from '@/lib/audit/emitEvent';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import type { Plan, SubscriptionStatus } from '@/lib/entitlements/types';

export type EntitlementGrantDTO = {
  id: string;
  userId: string;
  plan: Plan;
  status: SubscriptionStatus;
  periodEnd?: string;
  createdAt?: string;
};

export const entitlementGrantService = {
  async grant(input: {
    userId: string;
    plan: Plan;
    days?: number;
    status?: SubscriptionStatus;
    auditRequest: AuditRequestContext;
  }): Promise<EntitlementGrantDTO> {
    const now = new Date();
    const periodEnd = input.days
      ? new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000)
      : undefined;
    const status = input.status ?? 'active';

    await connectToDatabase();
    if (!(await User.exists({ id: input.userId }))) {
      throw new DomainError({
        code: 'ENTITLEMENT_SUBJECT_UNAVAILABLE',
        status: 409,
        message: 'Entitlement subject is unavailable',
      });
    }

    let lease: AccountWriteLease | null = null;
    try {
      lease = await accountWriteBarrierService.acquireExternal({
        userId: input.userId,
        kind: 'SYSTEM_ADMIN',
      });

      const subscription = await Subscription.create({
        userId: input.userId,
        plan: input.plan,
        status,
        periodEnd,
        meta: {
          source: 'dev_endpoint',
          grantedAt: now.toISOString(),
        },
      });

      await emitEvent({
        event: 'ENTITLEMENT_GRANTED',
        actor: { userId: input.userId },
        request: input.auditRequest,
        target: {
          type: 'user',
          id: input.userId,
        },
        metadata: {
          userId: input.userId,
          plan: input.plan,
          status,
          periodEnd: periodEnd?.toISOString() ?? null,
          source: 'dev_endpoint',
        },
      });

      return {
        id: String(subscription._id),
        userId: subscription.userId,
        plan: subscription.plan,
        status: subscription.status,
        periodEnd: subscription.periodEnd?.toISOString(),
        createdAt: subscription.createdAt?.toISOString(),
      };
    } catch (error) {
      if (error instanceof AccountWriteBarrierError) {
        throw new DomainError({
          code: 'ENTITLEMENT_SUBJECT_UNAVAILABLE',
          status: 409,
          message: 'Entitlement subject is unavailable',
        });
      }
      throw error;
    } finally {
      if (lease) await accountWriteBarrierService.release(lease);
    }
  },
};
