import { createHash, randomUUID } from 'node:crypto';
import { AssessmentParticipant, type AssessmentParticipantType } from '@/models/AssessmentParticipant';
import { AssessmentSupport, AssessmentOpsEvent, type AssessmentSupportType } from '@/models/AssessmentOperations';
import { AssessmentRun } from '@/models/AssessmentRun';
import { AssessmentPortfolio } from '@/models/AssessmentPortfolio';
import { SessionSubject } from '@/models/SessionSubject';
import { User } from '@/models/User';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { connectToDatabase } from '@/lib/mongodb';
import { ASSESSMENT_DATA_FLOW, ASSESSMENT_INFORMATION_VERSION, ASSESSMENT_REGISTRATION_PUBLICATIONS, ASSESSMENT_TERMS_VERSION, AssessmentWithdrawSchema, type AssessmentWithdraw,
  AssessmentRegistrationSchema, AssessmentSettingsMutationSchema, AssessmentSupportInputSchema, type AssessmentChoices, type AssessmentRegistration, type AssessmentSettingsDTO, type AssessmentSettingsMutation, type AssessmentSupportInput } from '@/domain/assessment/admission';
import { assessmentFail as fail, assessmentMode, assessmentTargetId, assessmentTransaction, isAssessmentEnabled, readAssessmentBetaApproval, requireAssessmentOwner, requireAssessmentRecoveryReadable } from './assessmentAccess.service';
import { recordAssessmentRevocation } from './assessmentRecovery.service';
import { enqueueAssessmentProjection } from './assessmentJobs.service';

const digest = (...values: string[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
async function viewerContext(ownerId: string) {
  const subject = await SessionSubject.findOne({ subjectKey: privacySubjectHash(ownerId) }).select({ version: 1 }).lean();
  const participant = await AssessmentParticipant.findById(ownerId).select({ deletionGeneration: 1, permissionEpoch: 1 }).lean();
  return { sessionVersion: subject?.version ?? '', token: digest('assessment-settings-intent-v2', ownerId, subject?.version ?? '', String(participant?.deletionGeneration ?? 0), String(participant?.permissionEpoch ?? 0)) };
}
const emptyChoices = (): AssessmentChoices => ({ ownerAssessment: false, discovery: false, pairSharing: false, publicationIds: [] });
function toDTO(intent: string, participant: AssessmentParticipantType | null): AssessmentSettingsDTO {
  const saved = participant?.registration;
  const registration = saved ? { termsVersion: saved.termsVersion, informationVersion: saved.informationVersion, acceptedAt: saved.acceptedAt, adultPolicy: saved.adultPolicy, choices: saved.choices, operationKey: saved.operationKey } : null;
  return { mode: assessmentMode(), admission: participant?.membershipStatus ?? (participant?.environment === 'ISOLATED_SYNTHETIC' ? 'ACTIVE' : 'UNAVAILABLE'),
    revision: participant?.settingsRevision ?? 0, viewerToken: intent, termsVersion: ASSESSMENT_TERMS_VERSION, informationVersion: ASSESSMENT_INFORMATION_VERSION,
    registration, settings: participant?.settings ?? (participant?.environment === 'ISOLATED_SYNTHETIC' ? { ownerAssessment: true, discovery: false, pairSharing: false, publicationIds: [...ASSESSMENT_REGISTRATION_PUBLICATIONS] } : emptyChoices()),
    dataFlow: ASSESSMENT_DATA_FLOW, availablePublicationIds: [...ASSESSMENT_REGISTRATION_PUBLICATIONS] };
}
const checkIntent = async (ownerId: string, token: string) => { if (token !== (await viewerContext(ownerId)).token) fail('VIEWER_CONTEXT_STALE', 'Аккаунт или настройки изменились. Обновите страницу.'); };
const supportDTO = (row: AssessmentSupportType) => ({ id: row._id, category: row.category, status: row.status, createdAt: row.createdAt.toISOString(), attachedResult: row.attachment !== null });
export const assessmentAdmissionService = {
  async withdraw(ownerId: string, input: AssessmentWithdraw): Promise<AssessmentSettingsDTO> {
    const parsed = AssessmentWithdrawSchema.safeParse(input); if (!parsed.success) fail('VALIDATION_ERROR', 'Недопустимый запрос.', 400);
    await checkIntent(ownerId, parsed.data.viewerToken);
    const participant = await requireAssessmentOwner(ownerId, { control: true });
    if ((participant.settingsRevision ?? 0) !== parsed.data.expectedRevision) fail('SETTINGS_STALE', 'Настройки изменились. Обновите страницу.');
    await recordAssessmentRevocation(ownerId);
    await assessmentTransaction(async session => {
      const current = await requireAssessmentOwner(ownerId, { control: true, session, fence: true });
      if ((current.settingsRevision ?? 0) !== parsed.data.expectedRevision) fail('SETTINGS_STALE', 'Настройки изменились. Обновите страницу.');
      await AssessmentParticipant.updateOne({ _id: ownerId }, { $set: { membershipStatus: 'REVOKED', revokedAt: new Date(), settings: emptyChoices() }, $inc: { settingsRevision: 1, permissionEpoch: 1 } }, { session });
      await AssessmentRun.updateMany({ ownerId }, { $set: { matchingUse: false, pairUse: false }, $inc: { permissionRevision: 1 } }, { session });
    });
    return this.get(ownerId);
  },
  async get(ownerId: string): Promise<AssessmentSettingsDTO> {
    await connectToDatabase();
    await requireAssessmentRecoveryReadable();
    if (!await User.exists({ id: ownerId }) || !await SessionSubject.exists({ subjectKey: privacySubjectHash(ownerId), $or: [{ accountState: 'ACTIVE' }, { accountState: { $exists: false } }] })) fail('NOT_FOUND', 'Аккаунт недоступен.', 404);
    return toDTO((await viewerContext(ownerId)).token, await AssessmentParticipant.findById(ownerId).lean<AssessmentParticipantType | null>());
  },
  async register(ownerId: string, input: AssessmentRegistration): Promise<AssessmentSettingsDTO> {
    await connectToDatabase();
    const parsed = AssessmentRegistrationSchema.safeParse(input); if (!parsed.success) fail('VALIDATION_ERROR', 'Проверьте выбор условий и настроек.', 400);
    const choice = parsed.data;
    const context = await viewerContext(ownerId);
    const prior = await AssessmentParticipant.findById(ownerId).lean();
    const retry = prior?.registration?.operationKey === choice.idempotencyKey && prior.registration.requestIntent === choice.viewerToken && prior.registration.sessionVersion === context.sessionVersion;
    if (!retry) await checkIntent(ownerId, choice.viewerToken);
    if (!isAssessmentEnabled()) fail('BETA_UNAVAILABLE', 'Допуск к бете пока не открыт.', 503);
    await assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { control: true, session, fence: true });
      if (participant.registration?.operationKey === choice.idempotencyKey) {
        const previous = participant.registration.choices;
        if (previous.ownerAssessment !== choice.ownerAssessment || previous.discovery !== choice.discovery || previous.pairSharing !== choice.pairSharing) fail('IDEMPOTENCY_CONFLICT', 'Ключ использован для другого выбора.');
        return;
      }
      const updatedTerms = participant.membershipStatus === 'ACTIVE' && participant.registration && (participant.registration.termsVersion !== choice.termsVersion || participant.registration.informationVersion !== choice.informationVersion);
      if (participant.membershipStatus !== 'INVITED' && participant.environment !== 'ISOLATED_SYNTHETIC' && !updatedTerms) fail('BETA_INVITATION_REQUIRED', 'Требуется действующее приглашение.', 403);
      const user = await User.findOne({ id: ownerId }).session(session).select({ 'personal.age': 1 }).lean();
      if (typeof user?.personal?.age === 'number' && user.personal.age < 18) fail('BETA_ADULT_SCOPE_REQUIRED', 'Закрытая бета доступна только совершеннолетним.', 403);
      if (participant.inviteExpiresAt && participant.inviteExpiresAt <= new Date()) fail('BETA_INVITATION_EXPIRED', 'Приглашение истекло.', 403);
      if (participant.environment === 'PRIVATE_BETA' && (participant.targetId !== assessmentTargetId() || participant.cohortId !== readAssessmentBetaApproval()?.cohortId)) fail('BETA_INVITATION_REQUIRED', 'Требуется действующее приглашение.', 403);
      const choices: AssessmentChoices = { ownerAssessment: choice.ownerAssessment, discovery: choice.ownerAssessment && choice.discovery, pairSharing: choice.ownerAssessment && choice.pairSharing, publicationIds: [...ASSESSMENT_REGISTRATION_PUBLICATIONS] };
      await AssessmentParticipant.updateOne({ _id: ownerId }, { $set: { membershipStatus: 'ACTIVE', settings: choices, registration: {
        termsVersion: choice.termsVersion, informationVersion: choice.informationVersion, acceptedAt: new Date().toISOString(), adultPolicy: 'SELF_DECLARED_18_PLUS', choices, operationKey: choice.idempotencyKey, requestIntent: choice.viewerToken, sessionVersion: context.sessionVersion,
      } }, $inc: { settingsRevision: 1, permissionEpoch: 1 } }, { session });
    });
    return this.get(ownerId);
  },
  async updateSettings(ownerId: string, input: AssessmentSettingsMutation): Promise<AssessmentSettingsDTO> {
    const parsed = AssessmentSettingsMutationSchema.safeParse(input); if (!parsed.success) fail('VALIDATION_ERROR', 'Недопустимые настройки.', 400);
    const mutation = parsed.data; await checkIntent(ownerId, mutation.viewerToken);
    if (mutation.publicationIds.some(id => !ASSESSMENT_REGISTRATION_PUBLICATIONS.includes(id))) fail('PURPOSE_NOT_APPROVED', 'Для новых данных требуется отдельное информирование.', 400);
    const existing = await requireAssessmentOwner(ownerId, { control: true });
    const old = existing.settings ?? emptyChoices();
    const expands = (!old.ownerAssessment && mutation.ownerAssessment) || (!old.discovery && mutation.discovery) || (!old.pairSharing && mutation.pairSharing) || mutation.publicationIds.some(id => !old.publicationIds.includes(id));
    if (expands && (!isAssessmentEnabled() || (existing.environment === 'PRIVATE_BETA' && (!existing.registration || existing.membershipStatus !== 'ACTIVE')))) fail('BETA_ENROLLMENT_REQUIRED', 'Для включения требуется текущий допуск.', 403);
    const revokes = (old.ownerAssessment && !mutation.ownerAssessment) || (old.discovery && !mutation.discovery) || (old.pairSharing && !mutation.pairSharing) || old.publicationIds.some(id => !mutation.publicationIds.includes(id));
    if (revokes) await recordAssessmentRevocation(ownerId, { permissionEpoch: (existing.permissionEpoch ?? 0) + 1 });
    await assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { control: true, session, fence: true });
      if ((participant.settingsRevision ?? 0) !== mutation.expectedRevision) fail('SETTINGS_STALE', 'Настройки изменены в другой вкладке. Обновите страницу.');
      const choices: AssessmentChoices = { ownerAssessment: mutation.ownerAssessment, discovery: mutation.ownerAssessment && mutation.discovery, pairSharing: mutation.ownerAssessment && mutation.pairSharing, publicationIds: mutation.publicationIds };
      await AssessmentParticipant.updateOne({ _id: ownerId }, { $set: { settings: choices }, $inc: { settingsRevision: 1, permissionEpoch: 1 },
        $push: { choiceHistory: { $each: [{ revision: mutation.expectedRevision + 1, recordedAt: new Date().toISOString(), informationVersion: ASSESSMENT_INFORMATION_VERSION, choices }], $slice: -100 } } }, { session });
      // This explicit choice names both selected saved forms and future forms. Deployment/registration alone does not broaden old records.
      await AssessmentRun.updateMany({ ownerId, publicationId: { $in: choices.publicationIds }, status: { $ne: 'DELETED' } }, { $set: { matchingUse: choices.discovery, pairUse: choices.pairSharing }, $inc: { permissionRevision: 1 } }, { session });
      await AssessmentRun.updateMany({ ownerId, publicationId: { $nin: choices.publicationIds } }, { $set: { matchingUse: false, pairUse: false }, $inc: { permissionRevision: 1 } }, { session });
      const portfolio = await AssessmentPortfolio.findOneAndUpdate({ _id: ownerId }, { $inc: { sourceSetRevision: 1 }, $set: { materializedRevision: -1, snapshot: null, ownerId, deletionGeneration: participant.deletionGeneration } }, { upsert: true, new: true, session }).lean();
      if (choices.ownerAssessment && portfolio) await enqueueAssessmentProjection({ ownerId, sourceSetRevision: portfolio.sourceSetRevision, deletionGeneration: participant.deletionGeneration }, session);
    });
    return this.get(ownerId);
  },
  async support(ownerId: string, input: AssessmentSupportInput) {
    const parsed = AssessmentSupportInputSchema.safeParse(input); if (!parsed.success) fail('VALIDATION_ERROR', 'Проверьте обращение.', 400);
    const mutation = parsed.data; await checkIntent(ownerId, mutation.viewerToken);
    return assessmentTransaction(async session => {
      await requireAssessmentOwner(ownerId, { control: true, session, fence: true });
      const id = digest('assessment-support-v1', ownerId, mutation.idempotencyKey); const requestHash = digest(JSON.stringify(mutation));
      const previous = await AssessmentSupport.findById(id).session(session).lean();
      if (previous) { if (previous.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Ключ использован для другого обращения.'); return supportDTO(previous); }
      if (await AssessmentSupport.countDocuments({ ownerId, status: 'OPEN' }).session(session) >= 10) fail('SUPPORT_LIMIT', 'Дождитесь обработки открытых обращений.', 429);
      let attachment: AssessmentSupportType['attachment'] = null;
      if (mutation.attachResult) {
        const row = await AssessmentRun.findOne({ _id: mutation.attachResult.runId, ownerId, revision: mutation.attachResult.revision, status: 'FINALIZED' }).session(session).lean();
        if (!row?.snapshot || row.materializedRevision !== row.revision) fail('SOURCE_UNAVAILABLE', 'Выбранный результат недоступен.');
        attachment = { runId: row._id, revision: row.revision, snapshotJson: JSON.stringify(row.snapshot), consentAt: new Date() };
      }
      const created = await AssessmentSupport.create([{ _id: id, ownerId, requestHash, category: mutation.category, message: mutation.message, publicationId: mutation.publicationId ?? null, attachment }], { session });
      return supportDTO(created[0].toObject());
    });
  },
  async supportList(ownerId: string) { await requireAssessmentOwner(ownerId, { control: true }); return (await AssessmentSupport.find({ ownerId }).sort({ createdAt: -1 }).limit(50).lean()).map(supportDTO); },
  async exportOwnerData(ownerId: string) {
    await requireAssessmentRecoveryReadable();
    const participant = await AssessmentParticipant.findById(ownerId).lean();
    const rows = await AssessmentSupport.find({ ownerId }).sort({ createdAt: -1 }).limit(501).lean();
    return { registration: participant?.registration ?? null, settings: participant?.settings ?? null, choiceHistory: participant?.choiceHistory ?? [], permissionEpoch: participant?.permissionEpoch ?? 0,
      support: rows.slice(0, 500).map(row => ({ ...supportDTO(row), message: row.message, publicationId: row.publicationId, attachment: row.attachment })), truncated: rows.length > 500 };
  },
};

/** Operator-only helper; never called by participant routes and never prints private content. */
export async function resolveAssessmentSupport(id: string): Promise<boolean> {
  const now = new Date(); const result = await AssessmentSupport.updateOne({ _id: id, status: 'OPEN' }, { $set: { status: 'RESOLVED', resolvedAt: now, expiresAt: new Date(now.getTime() + 30 * 86400000) } });
  await AssessmentOpsEvent.create({ _id: randomUUID(), category: 'OPERATOR', code: 'SUPPORT_RESOLVED', durationMs: 0, expiresAt: new Date(Date.now() + 7 * 86400000) });
  return result.modifiedCount === 1;
}
