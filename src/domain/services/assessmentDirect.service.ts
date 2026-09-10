import type { ClientSession } from 'mongoose';
import { BetaDirectMutationSchema, betaDirectPlanSchema, type BetaDirectDTO, type BetaDirectMutation } from '@/lib/dto/assessmentBeta.dto';
import { AssessmentDirect, type AssessmentDirectType } from '@/models/AssessmentDirect';
import { AssessmentOperation } from '@/models/AssessmentRun';
import { SessionSubject } from '@/models/SessionSubject';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { assessmentFail as fail, assessmentTransaction, requireAssessmentOwner, requireAssessmentEffect } from './assessmentAccess.service';
import { assessmentIdentity } from './assessmentRuns.service';
export const betaDirectId = (ownerId: string) => `beta:${ownerId}`;
async function token(ownerId: string, session: ClientSession): Promise<string> {
  const account = await SessionSubject.findOne({ subjectKey: privacySubjectHash(ownerId), accountState: { $nin: ['DELETED', 'DELETING'] } }).session(session).select({ version: 1 }).lean();
  if (!account) fail('NOT_FOUND', 'Аккаунт недоступен.', 404);
  return assessmentIdentity('beta-direct-intent-v1', ownerId, account.version);
}
export const betaDirectService = {
  get(ownerId: string, control = false): Promise<BetaDirectDTO> {
    return assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, control, fence: true });
      const row = await AssessmentDirect.findOne({ _id: betaDirectId(ownerId), ownerId }).session(session).lean<AssessmentDirectType | null>();
      const parsed = betaDirectPlanSchema.safeParse(row?.betaPlan);
      const active = row?.status === 'ACTIVE' && row.deletionGeneration === participant.deletionGeneration && parsed.success;
      return { viewerToken: await token(ownerId, session), revision: row?.revision ?? 0, plan: active ? parsed.data : null, discoveryOptIn: active && row.betaDiscoveryOptIn === true, pairUse: active && row.pairUse };
    });
  },
  async mutate(ownerId: string, input: BetaDirectMutation): Promise<BetaDirectDTO> {
    const parsed = BetaDirectMutationSchema.safeParse(input);
    if (!parsed.success) fail('VALIDATION_ERROR', 'Проверьте условия и период.', 400);
    const mutation = parsed.data, control = mutation.action !== 'save';
    await assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, control, fence: true });
      if (!control) await requireAssessmentEffect('SUBMISSIONS', session);
      if (mutation.viewerToken !== await token(ownerId, session)) fail('VIEWER_CONTEXT_STALE', 'Аккаунт изменился. Обновите страницу.');
      const operationId = assessmentIdentity('beta-direct-operation-v1', ownerId, mutation.idempotencyKey), requestHash = assessmentIdentity(JSON.stringify(mutation));
      const receipt = await AssessmentOperation.findById(operationId).session(session).lean();
      if (receipt) { if (receipt.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Ключ уже использован.'); return; }
      const row = await AssessmentDirect.findById(betaDirectId(ownerId)).session(session).lean<AssessmentDirectType | null>();
      if ((row?.revision ?? 0) !== mutation.expectedRevision) fail('BETA_DIRECT_STALE', 'Условия изменились в другой вкладке.');
      if (mutation.action === 'save' && Date.parse(mutation.plan.period.endsAt) <= Date.now()) fail('VALIDATION_ERROR', 'Период планирования уже завершён.', 400);
      const revision = (row?.revision ?? 0) + 1;
      await AssessmentDirect.updateOne({ _id: betaDirectId(ownerId) }, { $set: {
        ownerId, revision, permissionRevision: (row?.permissionRevision ?? 0) + 1, deletionGeneration: participant.deletionGeneration,
        status: mutation.action === 'delete' ? 'DELETED' : 'ACTIVE', useForComparison: false, answers: null,
        betaPlan: mutation.action === 'save' ? mutation.plan : mutation.action === 'delete' ? null : row?.betaPlan ?? null,
        betaDiscoveryOptIn: mutation.action === 'save' && mutation.discoveryOptIn, pairUse: mutation.action === 'save' && mutation.pairUse,
        period: mutation.action === 'save' ? { id: 'beta-future-plan-v1', ...mutation.plan.period } : row?.period ?? { id: 'deleted', startsAt: new Date().toISOString(), endsAt: new Date().toISOString() },
      } }, { upsert: true, session });
      await AssessmentOperation.create([{ _id: operationId, ownerId, requestHash, committedRevision: revision }], { session });
    });
    return this.get(ownerId, control);
  },
};
