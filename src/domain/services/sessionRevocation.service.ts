import { randomUUID } from 'crypto';
import { connectToDatabase } from '@/lib/mongodb';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { SessionSubject } from '@/models/SessionSubject';

export const sessionRevocationService = {
  async getOrCreateVersion(userId: string): Promise<string> {
    await connectToDatabase();
    const key = privacySubjectHash(userId);
    const candidateVersion = randomUUID();
    await SessionSubject.updateOne(
      { subjectKey: key },
      {
        $setOnInsert: {
          subjectKey: key,
          version: candidateVersion,
          accountState: 'ACTIVE',
          writeLeases: [],
          writeLeaseRevision: 0,
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
    const subject = await SessionSubject.findOne({
      subjectKey: key,
      $or: [
        { accountState: 'ACTIVE' },
        { accountState: { $exists: false } },
      ],
    })
      .select({ version: 1 })
      .lean<{ version: string } | null>();

    if (!subject) throw new Error('ACCOUNT_NOT_ACTIVE');
    return subject.version;
  },

  async isActive(userId: string, version: string): Promise<boolean> {
    await connectToDatabase();
    if (!version.trim()) return false;
    return Boolean(
      await SessionSubject.exists({
        subjectKey: privacySubjectHash(userId),
        version,
        $or: [
          { accountState: 'ACTIVE' },
          { accountState: { $exists: false } },
        ],
      })
    );
  },

  async isDeletionControlSession(
    userId: string,
    version: string
  ): Promise<boolean> {
    await connectToDatabase();
    if (!version.trim()) return false;
    return Boolean(
      await SessionSubject.exists({
        subjectKey: privacySubjectHash(userId),
        version,
        $or: [
          { accountState: { $in: ['ACTIVE', 'DELETING'] } },
          { accountState: { $exists: false } },
        ],
      })
    );
  },

  async revokeAll(userId: string, now = new Date()): Promise<string> {
    await connectToDatabase();
    const version = randomUUID();
    const key = privacySubjectHash(userId);
    const subject = await SessionSubject.findOneAndUpdate(
      {
        subjectKey: key,
        $or: [
          { accountState: 'ACTIVE' },
          { accountState: { $exists: false } },
        ],
      },
      {
        $set: { version, revokedAt: now },
      },
      { new: true, projection: { version: 1 } }
    ).lean<{ version: string } | null>();
    if (subject) return subject.version;

    const current = await SessionSubject.findOne({ subjectKey: key })
      .select({ version: 1 })
      .lean<{ version: string } | null>();
    if (!current) throw new Error('SESSION_SUBJECT_NOT_PERSISTED');
    return current.version;
  },
};
