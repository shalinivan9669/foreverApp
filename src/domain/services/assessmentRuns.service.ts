import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { AssessmentAnswerInputSchema, type AssessmentPeriod } from '@/domain/assessment/contracts';
import type { AssessmentItem } from '@/domain/assessment/contracts';
import { DOM_S07_PUBLICATION, isAssessmentItemAvailable, parseAssessmentResponse } from '@/domain/assessment/publication';
import { computeAssessmentProfile } from '@/domain/assessment/profile';
import { AssessmentMutationSchema, toAssessmentItemDTO, type AssessmentMutation, type AssessmentRunDTO, type OwnerAssessmentProfileDTO } from '@/lib/dto/assessment.dto';
import { AssessmentRun, AssessmentOperation, type AssessmentRunType } from '@/models/AssessmentRun';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { assessmentFail as fail, assessmentTransaction, isAssessmentEnabled, requireAssessmentOwner } from './assessmentAccess.service';
import { connectToDatabase } from '@/lib/mongodb';

export const assessmentIdentity = (...values: string[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const runId = (ownerId: string) => `assessment:${assessmentIdentity(ownerId, DOM_S07_PUBLICATION.id)}`;
const viewerToken = (ownerId: string) => assessmentIdentity('assessment-viewer-intent-v1', ownerId, DOM_S07_PUBLICATION.id);
const hint = 'Полный цикл включает замеченную задачу, план, организацию выполнения и проверку результата. Изменения и помощь нужно согласовать. Это авторский учебный пример, а не оценка вашего поведения.';
const phaseFor = (row: AssessmentRunType, item: AssessmentItem) => row.assistedItemIds.includes(item.id) ? 'ASSISTED' as const
  : item.method === 'SELF_REPORT' && row.observationRound > 0 ? 'FOLLOWUP' as const : 'BASELINE' as const;

function periodAt(now: Date): AssessmentPeriod {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = new Date(end.getTime() - 28 * 86_400_000);
  return { id: `household-28d:${start.toISOString().slice(0, 10)}`, startsAt: start.toISOString(), endsAt: end.toISOString() };
}
function requirePublication(row: AssessmentRunType) {
  if (row.publicationId !== DOM_S07_PUBLICATION.id || row.publicationVersion !== DOM_S07_PUBLICATION.version) fail('CONTENT_VERSION_UNAVAILABLE', 'Сохранённая редакция недоступна. Ответы сохранены; требуется восстановление публикации.');
  return DOM_S07_PUBLICATION;
}
async function readSource(ownerId: string, session?: ClientSession) {
  return AssessmentRun.findOne({ _id: runId(ownerId), ownerId }).session(session ?? null).lean<AssessmentRunType | null>();
}

/** A new observation draft does not supersede the last committed source until finalization. */
export function currentAssessmentSource(row: AssessmentRunType): AssessmentRunType {
  if (row.status !== 'DRAFT' || !row.previousSource) return row;
  const previous = row.previousSource;
  return { ...row, status: 'FINALIZED', revision: previous.revision, materializedRevision: previous.revision,
    period: previous.period, answers: previous.answers, snapshot: previous.snapshot,
    observationRound: previous.observationRound, finalizedAt: previous.finalizedAt };
}

function toDTO(ownerId: string, row: AssessmentRunType | null, requestedItemId?: string): AssessmentRunDTO {
  const publication = row ? requirePublication(row) : DOM_S07_PUBLICATION;
  const published = row ? currentAssessmentSource(row) : null;
  const ready = published?.status === 'FINALIZED' && published.materializedRevision === published.revision && published.snapshot !== null;
  const selected = row?.presentations.find(receipt => receipt.itemId === requestedItemId);
  const item = selected && publication.items.find(candidate => candidate.id === selected.itemId);
  return {
    viewerToken: viewerToken(ownerId),
    publication: { id: publication.id, version: publication.version, title: publication.title, status: publication.status, policyStatus: publication.policyStatus },
    status: row?.status ?? 'NEW', revision: row?.revision ?? 0, calculation: row?.status === 'FINALIZED' ? ready ? 'READY' : 'PENDING' : 'NOT_STARTED',
    period: row?.period ?? null, pairUse: row?.pairUse ?? false, matchingUse: row?.matchingUse ?? false, permissionRevision: row?.permissionRevision ?? 0,
    answers: row?.status === 'DELETED' ? [] : row?.answers.map(({ itemId, response, revision, phase, recordedAt }) => {
      const question = publication.items.find(candidate => candidate.id === itemId);
      const summary = response.kind === 'OPTION' ? [question?.options.find(option => option.id === response.optionId)?.label ?? 'Вариант недоступен']
        : response.kind === 'FACTS' ? question?.fields.map(field => `${field.label} — ${response.values[field.id] === true ? 'Да' : response.values[field.id] === false ? 'Нет' : 'Не знаю / не помню'}`) ?? []
          : [{ SKIPPED: 'Пропущено по своему выбору', NO_EXPERIENCE: 'Нет опыта', NO_OPPORTUNITY: 'Не было возможности', UNCLEAR: 'Не могу вспомнить или определить' }[response.reason]];
      return { itemId, response, revision, phase, recordedAt, summary };
    }) ?? [],
    items: publication.items.map(candidate => ({ id: candidate.id, title: candidate.title, available: row?.status !== 'DELETED' && isAssessmentItemAvailable(candidate, row?.answers ?? []), answered: row?.answers.some(answer => answer.itemId === candidate.id) ?? false })),
    presentation: selected && item && row?.status === 'DRAFT' && isAssessmentItemAvailable(item, row.answers)
      ? { presentationId: selected.presentationId, item: { ...toAssessmentItemDTO(item), instructions: row.followupSince && item.method === 'SELF_REPORT'
        ? `Новая серия: описывайте только другие эпизоды после ${row.followupSince} (UTC) и после вашей попытки выполнения. Не повторяйте ранее описанные случаи. Если нового опыта пока нет, отметьте это. ${item.instructions}` : item.instructions }, phase: selected.phase, hint: selected.phase === 'ASSISTED' ? hint : null } : null,
    profile: published?.status === 'FINALIZED' ? { version: 'assessment-profile-v1', status: ready ? 'READY' : 'PENDING', snapshot: ready ? published.snapshot : null } : null,
  };
}

export type AssessmentCalculationHooks = { afterSourceCommitted?: () => Promise<void>; afterComputed?: () => Promise<void> };

/** Called by the authorized agreement workflow, never by an HTTP score/actor override. */
export async function beginAssessmentFollowup(ownerId: string, session: ClientSession, now = new Date()): Promise<void> {
  const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
  const row = await readSource(ownerId, session);
  if (!row || row.status === 'DELETED' || row.deletionGeneration !== participant.deletionGeneration) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
  if (row.status !== 'FINALIZED' || !row.snapshot || row.materializedRevision !== row.revision || !row.finalizedAt) fail('ASSESSMENT_NOT_FINALIZED', 'Завершите текущее прохождение до новой серии наблюдений.');
  await AssessmentRun.updateOne({ _id: row._id, ownerId, revision: row.revision }, { $set: {
    previousSource: { revision: row.revision, period: row.period, answers: row.answers, snapshot: row.snapshot, observationRound: row.observationRound, finalizedAt: row.finalizedAt },
    followupSince: now.toISOString(),
    status: 'DRAFT', answers: [], presentations: [], assistedItemIds: DOM_S07_PUBLICATION.items.filter(item => item.method !== 'SELF_REPORT').map(item => item.id), snapshot: null,
    materializedRevision: -1, finalizedAt: null, period: periodAt(now),
  }, $inc: { revision: 1, observationRound: 1 } }, { session });
}

export async function materializeAssessment(ownerId: string, hooks: AssessmentCalculationHooks = {}): Promise<void> {
  const participant = await requireAssessmentOwner(ownerId);
  const captured = await readSource(ownerId);
  if (!captured || captured.status !== 'FINALIZED' || captured.materializedRevision === captured.revision) return;
  requirePublication(captured);
  if (captured.deletionGeneration !== participant.deletionGeneration) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
  const snapshot = computeAssessmentProfile({ subjectId: ownerId, sourceId: captured._id, revision: captured.revision, generation: captured.deletionGeneration, period: captured.period, answers: captured.answers, observationRound: captured.observationRound });
  await hooks.afterComputed?.();
  await assessmentTransaction(async session => {
    const current = await requireAssessmentOwner(ownerId, { session, fence: true });
    if (current.deletionGeneration !== captured.deletionGeneration) fail('SOURCE_STALE', 'Основание изменилось. Обновите страницу.');
    const saved = await AssessmentRun.updateOne({ _id: captured._id, ownerId, status: 'FINALIZED', revision: captured.revision, permissionRevision: captured.permissionRevision, deletionGeneration: captured.deletionGeneration }, { $set: { snapshot, materializedRevision: captured.revision } }, { session });
    if (saved.matchedCount !== 1) fail('SOURCE_STALE', 'Основание изменилось. Обновите страницу.');
  });
}

export async function getOwnerAssessmentProfile(ownerId: string): Promise<OwnerAssessmentProfileDTO | null> {
  if (!isAssessmentEnabled()) return null;
  if (!await AssessmentParticipant.exists({ _id: ownerId, environment: 'ISOLATED_SYNTHETIC' })) return null;
  await materializeAssessment(ownerId);
  const current = await assessmentRunsService.get(ownerId);
  if (current.status === 'DELETED') return null;
  return current.profile ?? { version: 'assessment-profile-v1', status: current.status === 'NEW' ? 'NOT_STARTED' : 'DRAFT', snapshot: null };
}

/** Owner export is a privacy control: it remains reachable when capture is disabled. */
export async function exportOwnerAssessmentData(ownerId: string) {
  await connectToDatabase();
  const row = await readSource(ownerId);
  if (!row || row.status === 'DELETED') return null;
  return {
    publicationId: row.publicationId, publicationVersion: row.publicationVersion, status: row.status,
    revision: row.revision, period: row.period, pairUse: row.pairUse, matchingUse: row.matchingUse, permissionRevision: row.permissionRevision,
    answers: row.answers.map(({ itemId, response, phase, revision, recordedAt }) => ({ itemId, response, phase, revision, recordedAt })),
    previousSource: row.previousSource,
    snapshot: row.status === 'FINALIZED' && row.materializedRevision === row.revision ? row.snapshot : null,
  };
}

export const assessmentRunsService = {
  async getControls(ownerId: string): Promise<AssessmentRunDTO> {
    return assessmentTransaction(async session => {
      await requireAssessmentOwner(ownerId, { control: true, session, fence: true });
      const row = await readSource(ownerId, session);
      const dto = toDTO(ownerId, row);
      return { ...dto, answers: [], items: [], presentation: null, profile: null, calculation: 'NOT_STARTED', period: null };
    });
  },
  async get(ownerId: string): Promise<AssessmentRunDTO> {
    await requireAssessmentOwner(ownerId);
    await materializeAssessment(ownerId);
    return assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
      const row = await readSource(ownerId, session);
      if (row && row.status !== 'DELETED' && row.deletionGeneration !== participant.deletionGeneration) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
      return toDTO(ownerId, row);
    });
  },
  async mutate(ownerId: string, input: AssessmentMutation, hooks: AssessmentCalculationHooks = {}): Promise<AssessmentRunDTO> {
    const parsed = AssessmentMutationSchema.safeParse(input);
    if (!parsed.success) fail('VALIDATION_ERROR', 'Недопустимая операция.', 400);
    const mutation = parsed.data;
    const control = mutation.action === 'delete' || (mutation.action === 'permission' && !mutation.pairUse) || (mutation.action === 'matching-permission' && !mutation.matchingUse);
    await requireAssessmentOwner(ownerId, { control });
    if (mutation.viewerToken !== viewerToken(ownerId)) fail('VIEWER_CONTEXT_STALE', 'Аккаунт изменился. Обновите страницу.');
    if (mutation.action === 'retry') return this.get(ownerId);
    const normalized = mutation.action === 'answer' && mutation.response.kind === 'FACTS'
      ? { ...mutation, response: { ...mutation.response, values: Object.fromEntries(Object.entries(mutation.response.values).sort(([a], [b]) => a.localeCompare(b))) } } : mutation;
    const requestHash = assessmentIdentity(JSON.stringify(normalized));
    await assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, control, fence: true });
      const operationId = assessmentIdentity(runId(ownerId), mutation.idempotencyKey);
      const previous = await AssessmentOperation.findById(operationId).session(session).lean();
      if (previous) {
        if (previous.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого изменения.');
        return;
      }
      let row = await readSource(ownerId, session);
      if (!row) {
        if (mutation.action !== 'start') fail('ASSESSMENT_NOT_STARTED', 'Сначала откройте анкету.');
        const created = await AssessmentRun.create([{ _id: runId(ownerId), ownerId, publicationId: DOM_S07_PUBLICATION.id, publicationVersion: DOM_S07_PUBLICATION.version, deletionGeneration: participant.deletionGeneration, period: periodAt(new Date()) }], { session });
        row = created[0].toObject();
      }
      requirePublication(row);
      if (row.status === 'DELETED') fail('SOURCE_UNAVAILABLE', 'Ответы удалены.');
      if (row.deletionGeneration !== participant.deletionGeneration) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
      if (mutation.action !== 'start' && row.revision !== mutation.expectedRevision) fail('ASSESSMENT_STALE', 'Анкета изменена в другой вкладке. Обновите страницу.');
      if (mutation.action === 'permission') {
        if (row.pairUse !== mutation.pairUse) { row.pairUse = mutation.pairUse; row.permissionRevision++; row.revision++; row.snapshot = null; row.materializedRevision = -1; }
      } else if (mutation.action === 'matching-permission') {
        if (row.matchingUse !== mutation.matchingUse) { row.matchingUse = mutation.matchingUse; row.permissionRevision++; row.revision++; row.snapshot = null; row.materializedRevision = -1; }
      } else if (mutation.action === 'delete') {
        row.status = 'DELETED'; row.answers = []; row.presentations = []; row.assistedItemIds = []; row.snapshot = null; row.previousSource = null; row.followupSince = null;
        row.pairUse = false; row.matchingUse = false; row.permissionRevision++; row.deletionGeneration++; row.revision++; row.materializedRevision = -1;
        await AssessmentParticipant.updateOne({ _id: ownerId, deletionGeneration: participant.deletionGeneration }, { $inc: { deletionGeneration: 1 } }, { session });
        await AssessmentOperation.deleteMany({ ownerId }, { session });
      } else if (mutation.action === 'revise') {
        row.status = 'DRAFT'; row.snapshot = null; row.materializedRevision = -1; row.presentations = []; row.revision++;
      } else if (mutation.action !== 'start') {
        if (row.status !== 'DRAFT') fail('ASSESSMENT_FINALIZED', 'Ответы завершены. Для исправления откройте новую редакцию.');
        if (mutation.action === 'finalize') {
          if (DOM_S07_PUBLICATION.items.some(item => isAssessmentItemAvailable(item, row.answers) && !row.answers.some(answer => answer.itemId === item.id))) fail('ASSESSMENT_INCOMPLETE', 'Ответьте на доступные вопросы или явно пропустите их.', 400);
          row.status = 'FINALIZED'; row.finalizedAt = new Date().toISOString(); row.revision++; row.materializedRevision = -1; row.snapshot = null; row.previousSource = null;
        } else {
          const receipt = mutation.action === 'answer' ? row.presentations.find(item => item.presentationId === mutation.presentationId) : null;
          const itemId = mutation.action === 'answer' ? receipt?.itemId : mutation.itemId;
          const item = DOM_S07_PUBLICATION.items.find(candidate => candidate.id === itemId);
          if (!item || !isAssessmentItemAvailable(item, row.answers)) fail('PRESENTATION_UNAVAILABLE', 'Этот вопрос сейчас недоступен.');
          const parentRevision = item.dependsOn ? row.answers.find(answer => answer.itemId === item.dependsOn!.itemId)?.revision ?? null : null;
          if (mutation.action === 'answer') {
            AssessmentAnswerInputSchema.parse({ presentationId: mutation.presentationId, expectedRevision: mutation.expectedRevision, idempotencyKey: mutation.idempotencyKey, response: mutation.response });
            if (!receipt || receipt.parentRevision !== parentRevision || receipt.phase !== phaseFor(row, item)) fail('PRESENTATION_STALE', 'Предъявление изменилось. Откройте вопрос снова.');
            let response;
            try { response = parseAssessmentResponse(item, mutation.response); } catch { return fail('VALIDATION_ERROR', 'Недопустимый ответ для этого вопроса.', 400); }
            row.revision++;
            row.answers = row.answers.filter(answer => answer.itemId !== item.id);
            row.answers.push({ presentationId: receipt.presentationId, itemId: item.id, response, revision: row.revision, phase: receipt.phase, recordedAt: new Date().toISOString() });
            // Parent corrections replace dependent observations, even when the option stays the same.
            const descendants = DOM_S07_PUBLICATION.items.filter(candidate => candidate.dependsOn?.itemId === item.id).map(candidate => candidate.id);
            row.answers = row.answers.filter(answer => !descendants.includes(answer.itemId));
            row.presentations = row.presentations.filter(candidate => !descendants.includes(candidate.itemId));
          } else {
            const exposed = mutation.action === 'hint' ? [item.id, ...(item.exposureFor ?? [])] : item.exposureFor ?? [];
            for (const id of exposed) if (!row.assistedItemIds.includes(id)) row.assistedItemIds.push(id);
            if (mutation.action === 'hint') row.answers = row.answers.filter(answer => answer.itemId !== item.id);
            row.presentations = row.presentations.filter(candidate => candidate.itemId !== item.id && !exposed.includes(candidate.itemId));
            row.revision++;
            row.presentations.push({ presentationId: randomUUID(), itemId: item.id, issuedRevision: row.revision, parentRevision, phase: phaseFor(row, item), issuedAt: new Date().toISOString() });
          }
        }
      }
      const { _id, createdAt, updatedAt, ...changes } = row;
      void createdAt; void updatedAt;
      await AssessmentRun.updateOne({ _id, ownerId }, { $set: changes }, { session });
      await AssessmentOperation.create([{ _id: operationId, ownerId, requestHash, committedRevision: row.revision }], { session });
    });
    await hooks.afterSourceCommitted?.();
    if (!control) await materializeAssessment(ownerId, hooks);
    return assessmentTransaction(async session => {
      await requireAssessmentOwner(ownerId, { control, session, fence: true });
      const row = await readSource(ownerId, session);
      const itemId = mutation.action === 'present' || mutation.action === 'hint' ? mutation.itemId : undefined;
      return toDTO(ownerId, row, itemId);
    });
  },
};
