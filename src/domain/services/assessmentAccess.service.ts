import mongoose, { type ClientSession } from 'mongoose';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { AssessmentParticipant, type AssessmentParticipantType } from '@/models/AssessmentParticipant';
import { SessionSubject } from '@/models/SessionSubject';
import { User } from '@/models/User';
import { AssessmentRuntimeControl, type AssessmentEffect } from '@/models/AssessmentOperations';
import { ASSESSMENT_INFORMATION_VERSION, ASSESSMENT_TERMS_VERSION } from '@/domain/assessment/admission';

export function assessmentFail(code: string, message: string, status = 409): never { throw new DomainError({ code, message, status }); }

/** Intent is a binding to an authenticated actor epoch, never an authentication credential. */
export async function assessmentViewerIntent(ownerId: string, scope: string, session?: ClientSession): Promise<string> {
  const subject = await SessionSubject.findOne({ subjectKey: privacySubjectHash(ownerId) }).session(session ?? null).select({ version: 1 }).lean();
  const participant = await AssessmentParticipant.findById(ownerId).session(session ?? null).select({ deletionGeneration: 1, permissionEpoch: 1 }).lean();
  return createHash('sha256').update(JSON.stringify(['assessment-viewer-epoch-v1', ownerId, scope, subject?.version ?? '', participant?.permissionEpoch ?? 0, participant?.deletionGeneration ?? 0])).digest('hex');
}

export function isAssessmentEnvironment(): boolean {
  try {
    const target = new URL(process.env.MONGODB_URI ?? '');
    return target.protocol === 'mongodb:' && target.hostname === '127.0.0.1'
      && /^\/vmeste_[a-z0-9_]+_test$/.test(target.pathname)
      && !target.username && !target.password
      && Boolean(target.searchParams.get('replicaSet'));
  } catch { return false; }
}

export const ASSESSMENT_MIGRATION_VERSION = 'private-beta-additive-v1';
export const assessmentMode = (): 'OFF' | 'SYNTHETIC' | 'PRIVATE_BETA' => {
  const value = process.env.ASSESSMENT_MODE;
  if (value === 'PRIVATE_BETA' || value === 'SYNTHETIC') return value;
  return value === undefined && process.env.ASSESSMENT_SYNTHETIC_ENABLED === 'true' ? 'SYNTHETIC' : 'OFF';
};
/** Identity excludes credentials; this digest is configuration identity, not anonymization. */
export function assessmentTargetId(uri = process.env.MONGODB_URI ?? ''): string {
  try { const value = new URL(uri); return createHash('sha256').update(`${value.protocol}//${value.host}${value.pathname}|${value.searchParams.get('replicaSet') ?? ''}`).digest('hex'); }
  catch { return ''; }
}
const approvalSchema = z.object({
  schemaVersion: z.literal('private-beta-approval-v1'), targetId: z.string().length(64), expiresAt: z.string().datetime(),
  surface: z.enum(['DISCORD_ACTIVITY', 'WEB']), cohortId: z.string().min(1).max(80), maxAdmitted: z.number().int().min(1).max(100),
  operator: z.object({ name: z.string().min(1), evidenceRef: z.string().min(1), approvedAt: z.string().datetime() }).strict(),
  content: z.string().min(1), privacy: z.string().min(1), platform: z.string().min(1), adultPolicy: z.literal('SELF_DECLARED_18_PLUS'),
  retentionPolicy: z.string().min(1), alertChannelVerifiedAt: z.string().datetime(), realAuthSmokeEvidence: z.string().min(1),
}).strict();
export type AssessmentBetaApproval = z.infer<typeof approvalSchema>;
export function readAssessmentBetaApproval(): AssessmentBetaApproval | null {
  try {
    const path = process.env.ASSESSMENT_BETA_APPROVALS_PATH;
    if (!path || !process.env.ASSESSMENT_RECOVERY_MONGODB_URI || (process.env.ASSESSMENT_RECOVERY_IDENTITY_KEY?.length ?? 0) < 32 || !process.env.ASSESSMENT_ALERT_WEBHOOK_URL) return null;
    if (process.env.ASSESSMENT_SYNTHETIC_ENABLED === 'true' || process.env.LOCAL_ACCEPTANCE_RUN_ID || process.env.ALLOW_TEST_LOGIN === 'true' || process.env.AUTH_IMPERSONATION_ENABLED === 'true') return null;
    const target = new URL(process.env.MONGODB_URI ?? '');
    if (!['mongodb:', 'mongodb+srv:'].includes(target.protocol) || /(?:_test|synthetic|fixture)/i.test(target.pathname) || ['127.0.0.1', 'localhost'].includes(target.hostname)) return null;
    if (assessmentTargetId(process.env.ASSESSMENT_RECOVERY_MONGODB_URI) === assessmentTargetId()) return null;
    const bytes = readFileSync(path, 'utf8'); if (bytes.length > 16_384) return null;
    const parsed = approvalSchema.safeParse(JSON.parse(bytes));
    if (!parsed.success || parsed.data.targetId !== assessmentTargetId() || Date.parse(parsed.data.expiresAt) <= Date.now()) return null;
    if (Date.parse(parsed.data.operator.approvedAt) > Date.now() || Date.parse(parsed.data.alertChannelVerifiedAt) > Date.now()) return null;
    return parsed.data;
  } catch { return null; }
}
export const isAssessmentEnabled = () => assessmentMode() === 'SYNTHETIC' ? process.env.ASSESSMENT_SYNTHETIC_ENABLED === 'true' && isAssessmentEnvironment()
  : assessmentMode() === 'PRIVATE_BETA' && readAssessmentBetaApproval() !== null;

export function assessmentPurposeAllowed(participant: AssessmentParticipantType, purpose: 'OWNER' | 'MATCHING' | 'PAIR', publicationId?: string): boolean {
  if (participant.environment === 'ISOLATED_SYNTHETIC') return participant.membershipStatus !== 'REVOKED' && (!participant.settings || (
    participant.settings.ownerAssessment && (purpose === 'OWNER' || (purpose === 'MATCHING' ? participant.settings.discovery : participant.settings.pairSharing))
    && (!publicationId || participant.settings.publicationIds.includes(publicationId))));
  return participant.membershipStatus === 'ACTIVE' && participant.registration?.termsVersion === ASSESSMENT_TERMS_VERSION
    && participant.registration.informationVersion === ASSESSMENT_INFORMATION_VERSION && Boolean(participant.settings?.ownerAssessment)
    && (purpose === 'OWNER' || Boolean(purpose === 'MATCHING' ? participant.settings?.discovery : participant.settings?.pairSharing))
    && (!publicationId || Boolean(participant.settings?.publicationIds.includes(publicationId)));
}

export async function requireAssessmentEffect(effect: AssessmentEffect, session?: ClientSession): Promise<void> {
  if (!isAssessmentEnabled()) assessmentFail('NOT_FOUND', 'Раздел недоступен.', 404);
  await connectToDatabase();
  const control = await AssessmentRuntimeControl.findById(assessmentTargetId()).session(session ?? null).lean();
  if ((control && !control.recoveryReconciled) || (assessmentMode() === 'PRIVATE_BETA' && (!control || control.migrationVersion !== ASSESSMENT_MIGRATION_VERSION)) || control?.stoppedEffects.includes(effect)) {
    assessmentFail('BETA_PAUSED', 'Эта возможность временно приостановлена. Управление данными доступно.', 503);
  }
  if (session && control) {
    const fenced = await AssessmentRuntimeControl.updateOne({ _id: control._id, revision: control.revision, stoppedEffects: { $ne: effect }, recoveryReconciled: true }, { $inc: { revision: 1 } }, { session });
    if (fenced.matchedCount !== 1) assessmentFail('BETA_PAUSED', 'Возможность приостановлена. Обновите страницу.', 503);
  }
}

/** Disaster recovery is a distinct safety state: un-reconciled backup contents cannot be exported as current owner data. */
export async function requireAssessmentRecoveryReadable(): Promise<void> {
  await connectToDatabase();
  const control = await AssessmentRuntimeControl.findById(assessmentTargetId()).select({ recoveryReconciled: 1 }).lean();
  if (control && !control.recoveryReconciled) assessmentFail('BETA_RECOVERY_RECONCILIATION_REQUIRED', 'Восстановление данных ещё не сверено с журналом удалений. Удаление данных остаётся доступным.', 503);
}

export async function assessmentDisabledPublications(session?: ClientSession): Promise<string[]> {
  const control = await AssessmentRuntimeControl.findById(assessmentTargetId()).session(session ?? null).select({ disabledPublicationIds: 1 }).lean();
  return control?.disabledPublicationIds ?? [];
}
export async function requireAssessmentPublication(publicationId: string, session?: ClientSession): Promise<void> {
  if ((await assessmentDisabledPublications(session)).includes(publicationId)) assessmentFail('CONTENT_RETIRED', 'Эта редакция приостановлена. Сохранённые данные доступны для экспорта и удаления.', 409);
}

export async function requireAssessmentOwner(ownerId: string, options: { control?: boolean; session?: ClientSession; fence?: boolean } = {}): Promise<AssessmentParticipantType> {
  if (!options.control && !isAssessmentEnabled()) assessmentFail('NOT_FOUND', 'Раздел недоступен.', 404);
  await connectToDatabase();
  const session = options.session ?? null;
  const participant = await AssessmentParticipant.findOne({ _id: ownerId }).session(session).lean<AssessmentParticipantType | null>();
  const subject = await SessionSubject.findOne({ subjectKey: privacySubjectHash(ownerId), $or: [{ accountState: 'ACTIVE' }, { accountState: { $exists: false } }] }).session(session).select({ version: 1 }).lean();
  if (!participant || !subject) return assessmentFail('NOT_FOUND', 'Раздел недоступен.', 404);
  if (!options.control) {
    const environment = assessmentMode() === 'PRIVATE_BETA' ? 'PRIVATE_BETA' : 'ISOLATED_SYNTHETIC';
    if (participant.environment !== environment || !assessmentPurposeAllowed(participant, 'OWNER')) assessmentFail('BETA_ENROLLMENT_REQUIRED', 'Завершите приглашение и настройки участия.', 403);
    if (environment === 'PRIVATE_BETA' && (participant.targetId !== assessmentTargetId() || participant.cohortId !== readAssessmentBetaApproval()?.cohortId)) assessmentFail('NOT_FOUND', 'Раздел недоступен.', 404);
    await requireAssessmentEffect('DISCLOSURE', options.session);
  }
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
