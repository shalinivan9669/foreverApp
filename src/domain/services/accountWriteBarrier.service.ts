import { randomUUID } from 'crypto';
import type { ClientSession, FilterQuery } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import {
  SessionSubject,
  type AccountState,
  type AccountWriteLeaseKind,
} from '@/models/SessionSubject';

export const ACCOUNT_WRITE_LEASE_TTL_MS = 60_000;
export const ACCOUNT_WRITE_LEASE_HEARTBEAT_MS = 15_000;

export type AccountWriteLease = {
  subjectKey: string;
  token: string;
  generation: string;
  kind: AccountWriteLeaseKind;
};

export type AccountWriteBarrierReason =
  | 'ACCOUNT_NOT_ACTIVE'
  | 'SESSION_GENERATION_STALE'
  | 'LEASE_LOST'
  | 'DRAIN_TIMEOUT';

export class AccountWriteBarrierError extends Error {
  readonly reason: AccountWriteBarrierReason;

  constructor(reason: AccountWriteBarrierReason) {
    super(reason);
    this.name = 'AccountWriteBarrierError';
    this.reason = reason;
  }
}

const activeStateFilter: FilterQuery<{
  accountState?: AccountState;
}> = {
  $or: [{ accountState: 'ACTIVE' }, { accountState: { $exists: false } }],
};

const pruneExpired = async (subjectKey: string, now: Date): Promise<void> => {
  await SessionSubject.updateOne(
    { subjectKey },
    {
      $pull: { writeLeases: { expiresAt: { $lte: now } } },
      $inc: { writeLeaseRevision: 1 },
    }
  );
};

const ensureSubject = async (subjectKey: string): Promise<void> => {
  try {
    await SessionSubject.updateOne(
      { subjectKey },
      {
        $setOnInsert: {
          subjectKey,
          version: randomUUID(),
          accountState: 'ACTIVE',
          writeLeaseRevision: 0,
          writeLeases: [],
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    const duplicateKey =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000;
    if (!duplicateKey) throw error;
  }
};

const acquireForGeneration = async (input: {
  subjectKey: string;
  generation: string;
  kind: AccountWriteLeaseKind;
  now: Date;
  ttlMs: number;
}): Promise<AccountWriteLease> => {
  await pruneExpired(input.subjectKey, input.now);
  const token = randomUUID();
  const expiresAt = new Date(input.now.getTime() + input.ttlMs);
  const subject = await SessionSubject.findOneAndUpdate(
    {
      subjectKey: input.subjectKey,
      version: input.generation,
      ...activeStateFilter,
    },
    {
      $set: { accountState: 'ACTIVE' },
      $push: {
        writeLeases: {
          token,
          generation: input.generation,
          kind: input.kind,
          acquiredAt: input.now,
          heartbeatAt: input.now,
          expiresAt,
        },
      },
      $inc: { writeLeaseRevision: 1 },
    },
    { new: true, projection: { _id: 1 } }
  ).lean<{ _id: object } | null>();

  if (!subject) {
    const current = await SessionSubject.findOne({ subjectKey: input.subjectKey })
      .select({ version: 1, accountState: 1 })
      .lean<{ version: string; accountState?: AccountState } | null>();
    if (
      current &&
      current.version !== input.generation &&
      (current.accountState === undefined || current.accountState === 'ACTIVE')
    ) {
      throw new AccountWriteBarrierError('SESSION_GENERATION_STALE');
    }
    throw new AccountWriteBarrierError('ACCOUNT_NOT_ACTIVE');
  }

  return {
    subjectKey: input.subjectKey,
    token,
    generation: input.generation,
    kind: input.kind,
  };
};

const acquireExternal = async (input: {
  userId: string;
  kind: 'OAUTH_EXCHANGE' | 'SYSTEM_ADMIN' | 'BILLING_WEBHOOK';
  now?: Date;
  ttlMs?: number;
}): Promise<AccountWriteLease> => {
  await connectToDatabase();
  const subjectKey = privacySubjectHash(input.userId);
  await ensureSubject(subjectKey);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const subject = await SessionSubject.findOne({
      subjectKey,
      ...activeStateFilter,
    })
      .select({ version: 1 })
      .lean<{ version: string } | null>();
    if (!subject) throw new AccountWriteBarrierError('ACCOUNT_NOT_ACTIVE');
    try {
      return await acquireForGeneration({
        subjectKey,
        generation: subject.version,
        kind: input.kind,
        now: input.now ?? new Date(),
        ttlMs: input.ttlMs ?? ACCOUNT_WRITE_LEASE_TTL_MS,
      });
    } catch (error) {
      if (
        !(error instanceof AccountWriteBarrierError) ||
        error.reason !== 'SESSION_GENERATION_STALE' ||
        attempt === 1
      ) {
        throw error;
      }
    }
  }
  throw new AccountWriteBarrierError('ACCOUNT_NOT_ACTIVE');
};

export const accountWriteBarrierService = {
  async acquireAuthenticated(input: {
    userId: string;
    sessionVersion: string;
    now?: Date;
    ttlMs?: number;
  }): Promise<AccountWriteLease> {
    await connectToDatabase();
    return acquireForGeneration({
      subjectKey: privacySubjectHash(input.userId),
      generation: input.sessionVersion,
      kind: 'AUTHENTICATED_REQUEST',
      now: input.now ?? new Date(),
      ttlMs: input.ttlMs ?? ACCOUNT_WRITE_LEASE_TTL_MS,
    });
  },

  async acquireExternal(input: {
    userId: string;
    kind: 'OAUTH_EXCHANGE' | 'SYSTEM_ADMIN' | 'BILLING_WEBHOOK';
    now?: Date;
    ttlMs?: number;
  }): Promise<AccountWriteLease> {
    return acquireExternal(input);
  },

  async heartbeat(
    lease: AccountWriteLease,
    now = new Date(),
    ttlMs = ACCOUNT_WRITE_LEASE_TTL_MS
  ): Promise<void> {
    await connectToDatabase();
    const result = await SessionSubject.updateOne(
      {
        subjectKey: lease.subjectKey,
        'writeLeases.token': lease.token,
      },
      {
        $set: {
          'writeLeases.$.heartbeatAt': now,
          'writeLeases.$.expiresAt': new Date(now.getTime() + ttlMs),
        },
        $inc: { writeLeaseRevision: 1 },
      }
    );
    if (result.matchedCount !== 1) {
      throw new AccountWriteBarrierError('LEASE_LOST');
    }
  },

  async release(lease: AccountWriteLease): Promise<void> {
    await connectToDatabase();
    await SessionSubject.updateOne(
      { subjectKey: lease.subjectKey },
      {
        $pull: { writeLeases: { token: lease.token } },
        $inc: { writeLeaseRevision: 1 },
      }
    );
  },

  async beginDeletion(input: {
    userId: string;
    sessionVersion: string;
    now?: Date;
  }): Promise<{ subjectKey: string; generation: string }> {
    await connectToDatabase();
    const subjectKey = privacySubjectHash(input.userId);
    const now = input.now ?? new Date();
    const started = await SessionSubject.findOneAndUpdate(
      {
        subjectKey,
        version: input.sessionVersion,
        ...activeStateFilter,
      },
      {
        $set: { accountState: 'DELETING', deletionStartedAt: now },
        $inc: { writeLeaseRevision: 1 },
      },
      { new: true, projection: { version: 1 } }
    ).lean<{ version: string } | null>();
    if (started) return { subjectKey, generation: started.version };

    const retry = await SessionSubject.findOne({
      subjectKey,
      version: input.sessionVersion,
      accountState: 'DELETING',
    })
      .select({ version: 1 })
      .lean<{ version: string } | null>();
    if (retry) return { subjectKey, generation: retry.version };
    throw new AccountWriteBarrierError('ACCOUNT_NOT_ACTIVE');
  },

  async waitForQuiescence(input: {
    subjectKey: string;
    generation: string;
    maxWaitMs?: number;
    pollMs?: number;
    now?: () => Date;
    sleep?: (milliseconds: number) => Promise<void>;
    onWait?: (leaseCount: number) => void | Promise<void>;
  }): Promise<void> {
    await connectToDatabase();
    const maxWaitMs = input.maxWaitMs ?? ACCOUNT_WRITE_LEASE_TTL_MS + 5_000;
    const pollMs = input.pollMs ?? 50;
    const now = input.now ?? (() => new Date());
    const sleep =
      input.sleep ??
      ((milliseconds: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() <= deadline) {
      const observedAt = now();
      await pruneExpired(input.subjectKey, observedAt);
      const subject = await SessionSubject.findOne({
        subjectKey: input.subjectKey,
        version: input.generation,
        accountState: 'DELETING',
      })
        .select({ writeLeases: 1 })
        .lean<{ writeLeases?: Array<{ token: string }> } | null>();
      if (!subject) throw new AccountWriteBarrierError('ACCOUNT_NOT_ACTIVE');
      const leaseCount = subject.writeLeases?.length ?? 0;
      if (leaseCount === 0) return;
      await input.onWait?.(leaseCount);
      await sleep(pollMs);
    }
    throw new AccountWriteBarrierError('DRAIN_TIMEOUT');
  },

  async markDeleted(input: {
    subjectKey: string;
    generation: string;
    now: Date;
    session: ClientSession;
  }): Promise<void> {
    const result = await SessionSubject.updateOne(
      {
        subjectKey: input.subjectKey,
        version: input.generation,
        accountState: 'DELETING',
        $or: [
          { writeLeases: { $exists: false } },
          { writeLeases: { $size: 0 } },
        ],
      },
      {
        $set: {
          version: randomUUID(),
          accountState: 'DELETED',
          revokedAt: input.now,
          deletedAt: input.now,
          writeLeases: [],
        },
        $inc: { writeLeaseRevision: 1 },
      },
      { session: input.session }
    );
    if (result.matchedCount !== 1) {
      throw new AccountWriteBarrierError('LEASE_LOST');
    }
  },
};
