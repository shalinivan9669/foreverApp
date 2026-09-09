import mongoose, { type ClientSession } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { AssessmentParticipant, type AssessmentParticipantType } from '@/models/AssessmentParticipant';
import { SessionSubject } from '@/models/SessionSubject';
import { User } from '@/models/User';

export function assessmentFail(code: string, message: string, status = 409): never { throw new DomainError({ code, message, status }); }

export function isAssessmentEnvironment(): boolean {
  try {
    const target = new URL(process.env.MONGODB_URI ?? '');
    return target.protocol === 'mongodb:' && target.hostname === '127.0.0.1'
      && /^\/vmeste_[a-z0-9_]+_test$/.test(target.pathname)
      && !target.username && !target.password
      && Boolean(target.searchParams.get('replicaSet'));
  } catch { return false; }
}

export const isAssessmentEnabled = () => process.env.ASSESSMENT_SYNTHETIC_ENABLED === 'true' && isAssessmentEnvironment();

export async function requireAssessmentOwner(ownerId: string, options: { control?: boolean; session?: ClientSession; fence?: boolean } = {}): Promise<AssessmentParticipantType> {
  if (!options.control && !isAssessmentEnabled()) assessmentFail('NOT_FOUND', 'Раздел недоступен.', 404);
  await connectToDatabase();
  const session = options.session ?? null;
  const participant = await AssessmentParticipant.findOne({ _id: ownerId, environment: 'ISOLATED_SYNTHETIC' }).session(session).lean<AssessmentParticipantType | null>();
  const subject = await SessionSubject.findOne({ subjectKey: privacySubjectHash(ownerId), $or: [{ accountState: 'ACTIVE' }, { accountState: { $exists: false } }] }).session(session).select({ version: 1 }).lean();
  if (!participant || !subject) return assessmentFail('NOT_FOUND', 'Раздел недоступен.', 404);
  if (options.fence) {
    const found = await User.updateOne({ id: ownerId }, { $inc: { pairMembershipRevision: 1 } }, { session: options.session });
    if (found.matchedCount !== 1) assessmentFail('NOT_FOUND', 'Аккаунт недоступен.', 404);
  } else if (!await User.exists({ id: ownerId }).session(session)) assessmentFail('NOT_FOUND', 'Аккаунт недоступен.', 404);
  return participant;
}

export async function assessmentTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally { await session.endSession(); }
}
