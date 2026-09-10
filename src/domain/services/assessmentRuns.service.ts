import { createHash, randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { AssessmentAnswerInputSchema, type AssessmentPeriod } from '@/domain/assessment/contracts';
import type { AssessmentItem, AssessmentPurpose } from '@/domain/assessment/contracts';
import { DOM_S07_PUBLICATION, assessmentPublicationHash, compatibleAssessmentApplications, getAssessmentPublication, isAssessmentItemAvailable, parseAssessmentResponse } from '@/domain/assessment/publication';
import { assessmentObservations, computeAssessmentProfile, getUnavailableAssessmentSkills } from '@/domain/assessment/profile';
import { composeAssessmentSources, type AssessmentCompositionSource } from '@/domain/assessment/sources';
import { AssessmentMutationSchema, toAssessmentItemDTO, type AssessmentMutation, type AssessmentRunDTO, type OwnerAssessmentProfileDTO } from '@/lib/dto/assessment.dto';
import { AssessmentRun, AssessmentOperation, type AssessmentRunType } from '@/models/AssessmentRun';
import { AssessmentParticipant } from '@/models/AssessmentParticipant';
import { assessmentDisabledPublications, assessmentFail as fail, assessmentPurposeAllowed, assessmentTransaction, assessmentViewerIntent, isAssessmentEnabled, requireAssessmentEffect, requireAssessmentOwner, requireAssessmentPublication, requireAssessmentRecoveryReadable } from './assessmentAccess.service';
import { AssessmentPortfolio, type AssessmentPortfolioType } from '@/models/AssessmentPortfolio';
import { AssessmentPractice } from '@/models/AssessmentPractice';
import { Pair } from '@/models/Pair';
import { enqueueAssessmentProjection, recordAssessmentOps } from './assessmentJobs.service';
import { connectToDatabase } from '@/lib/mongodb';

export const assessmentIdentity = (...values: string[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const runId = (ownerId: string, publicationId = DOM_S07_PUBLICATION.id) => `assessment:${assessmentIdentity(ownerId, publicationId)}`;
const viewerToken = (ownerId: string, publicationId = DOM_S07_PUBLICATION.id, session?: ClientSession) => assessmentViewerIntent(ownerId, `assessment-run:${publicationId}`, session);
const hint = 'Полный цикл включает замеченную задачу, план, организацию выполнения и проверку результата. Изменения и помощь нужно согласовать. Это авторский учебный пример, а не оценка вашего поведения.';
const phaseFor = (row: AssessmentRunType, item: AssessmentItem) => row.assistedItemIds.includes(item.id) ? 'ASSISTED' as const
  : item.method === 'SELF_REPORT' && row.observationRound > 0 ? 'FOLLOWUP' as const : 'BASELINE' as const;

function periodAt(now: Date): AssessmentPeriod {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = new Date(end.getTime() - 28 * 86_400_000);
  return { id: `household-28d:${start.toISOString().slice(0, 10)}`, startsAt: start.toISOString(), endsAt: end.toISOString() };
}
function validateCompletedPeriod(period: AssessmentPeriod): void {
  const starts = Date.parse(period.startsAt), ends = Date.parse(period.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || starts >= ends || ends > Date.now() || ends - starts > 90 * 86400000) fail('ASSESSMENT_INVALID_PERIOD', 'Выберите завершённый период длительностью до 90 дней.', 400);
}
function requirePublication(row: AssessmentRunType) {
  const publication = getAssessmentPublication(row.publicationId, row.publicationVersion);
  if (!publication || row.contentHash && row.contentHash !== assessmentPublicationHash(publication)) fail('CONTENT_VERSION_UNAVAILABLE', 'Сохранённая редакция недоступна. Ответы сохранены; требуется восстановление публикации.');
  return publication;
}
async function readSource(ownerId: string, session?: ClientSession, publicationId = DOM_S07_PUBLICATION.id) {
  return AssessmentRun.findOne({ _id: runId(ownerId, publicationId), ownerId }).session(session ?? null).lean<AssessmentRunType | null>();
}

/** A followup or beta correction draft does not supersede the last committed source until finalization. */
export function currentAssessmentSource(row: AssessmentRunType): AssessmentRunType {
  if (row.status !== 'DRAFT' || !row.previousSource) return row;
  const previous = row.previousSource;
  return { ...row, status: 'FINALIZED', revision: previous.revision, materializedRevision: previous.revision,
    period: previous.period, answers: previous.answers, snapshot: previous.snapshot,
    observationRound: previous.observationRound, finalizedAt: previous.finalizedAt, contextIdentity: previous.contextIdentity ?? row.contextIdentity };
}

async function knownAssessmentEpisodes(ownerId: string, row: AssessmentRunType, item?: AssessmentItem, session?: ClientSession): Promise<NonNullable<AssessmentRunDTO['knownEpisodes']>> {
  const publication = requirePublication(row);
  if (item && item.method !== 'SELF_REPORT' || !publication.items.some(candidate => candidate.method === 'SELF_REPORT')) return [];
  const participant = await requireAssessmentOwner(ownerId, { control: true, session });
  const disabled = await assessmentDisabledPublications(session);
  const saved = await AssessmentRun.find({ ownerId, status: { $ne: 'DELETED' }, deletionGeneration: participant.deletionGeneration }).session(session ?? null).limit(64).lean<AssessmentRunType[]>();
  return saved.map(source => source._id === row._id ? row : currentAssessmentSource(source)).filter(source =>
    (source._id === row._id || source.status === 'FINALIZED') && !disabled.includes(source.publicationId) && assessmentPurposeAllowed(participant, 'OWNER', source.publicationId)
    && source.period.id === row.period.id && source.period.startsAt === row.period.startsAt && source.period.endsAt === row.period.endsAt
    && (source.contextIdentity ?? 'INDIVIDUAL') === (row.contextIdentity ?? 'INDIVIDUAL')
    && compatibleAssessmentApplications(publication, requirePublication(source)),
  ).flatMap(source => {
    const sourcePublication = requirePublication(source);
    return assessmentObservations(sourceInput(source)).observations.filter(observation => observation.track === 'SELF_REPORT'
      && (!item || observation.familyId === item.familyId && observation.phase === phaseFor(row, item))).flatMap(observation => {
      const sourceItem = sourcePublication.items.find(candidate => observation.sourceId.endsWith(`:${candidate.id}:${observation.phase}`));
      const answer = source.answers.find(answer => answer.itemId === sourceItem?.id);
      return sourceItem && answer?.response.kind === 'FACTS' && answer.response.episode ? [{ rootId: observation.rootId, label: sourceItem.title, observedAt: answer.response.episode.observedAt, publicationTitle: sourcePublication.title }] : [];
    });
  }).filter((episode, index, all) => all.findIndex(candidate => candidate.rootId === episode.rootId) === index).slice(0, 24);
}

async function toDTO(ownerId: string, row: AssessmentRunType | null, requestedItemId?: string, publicationId = DOM_S07_PUBLICATION.id, session?: ClientSession): Promise<AssessmentRunDTO> {
  const publication = row ? requirePublication(row) : getAssessmentPublication(publicationId);
  if (!publication) fail('CONTENT_VERSION_UNAVAILABLE', 'Публикация недоступна.', 404);
  const published = row ? currentAssessmentSource(row) : null;
  const ready = published?.status === 'FINALIZED' && published.materializedRevision === published.revision && published.snapshot !== null;
  const selected = row?.presentations.find(receipt => receipt.itemId === requestedItemId);
  const item = selected && publication.items.find(candidate => candidate.id === selected.itemId);
  return {
    ...(row ? { runId: row._id } : {}),
    ...(row?.exposureHistory ? { exposureHistory: row.exposureHistory } : {}),
    ...(publication.metadata && row?.status === 'DRAFT' && row.previousSource ? { retainedCompletedSource: row.previousSource.observationRound === row.observationRound ? 'CORRECTION' as const : 'FOLLOWUP' as const } : {}),
    viewerToken: await viewerToken(ownerId, publication.id, session),
    publication: { id: publication.id, version: publication.version, title: publication.title, status: publication.status, policyStatus: publication.policyStatus, skillId: publication.skillId, contentHash: assessmentPublicationHash(publication), explanation: publication.metadata?.explanation, requiresPeriod: publication.metadata?.samplingFrame === 'SELECTED_DESCRIBED_EPISODES' },
    status: row?.status ?? 'NEW', revision: row?.revision ?? 0, calculation: row?.status === 'FINALIZED' ? ready ? 'READY' : 'PENDING' : 'NOT_STARTED',
    period: row?.period ?? null, pairUse: row?.pairUse ?? false, matchingUse: row?.matchingUse ?? false, permissionRevision: row?.permissionRevision ?? 0,
    answers: row?.status === 'DELETED' ? [] : row?.answers.map(({ itemId, response, revision, phase, recordedAt }) => {
      const question = publication.items.find(candidate => candidate.id === itemId);
      const summary = response.kind === 'OPTION' ? [question?.options.find(option => option.id === response.optionId)?.label ?? 'Вариант недоступен']
        : response.kind === 'FACTS' ? question?.fields.map(field => `${field.label} — ${response.values[field.id] === true ? 'Да' : response.values[field.id] === false ? 'Нет' : 'Не знаю / не помню'}`) ?? []
          : response.kind === 'STRUCTURED' ? question?.slots?.map(slot => `${slot.label}: ${slot.options.find(option => option.id === response.slots[slot.id])?.label ?? 'Вариант недоступен'}`) ?? []
          : [{ SKIPPED: 'Пропущено по своему выбору', NO_EXPERIENCE: 'Нет опыта', NO_OPPORTUNITY: 'Не было возможности', UNCLEAR: 'Не могу вспомнить или определить', NONE_FITS: 'Ни один вариант не подходит', NOT_APPLICABLE: 'Условие неприменимо' }[response.reason]];
      return { itemId, response, revision, phase, recordedAt, summary };
    }) ?? [],
    items: publication.items.map(candidate => ({ id: candidate.id, title: candidate.title, available: row?.status !== 'DELETED' && isAssessmentItemAvailable(candidate, row?.answers ?? []), answered: row?.answers.some(answer => answer.itemId === candidate.id) ?? false })),
    presentation: selected && item && row?.status === 'DRAFT' && isAssessmentItemAvailable(item, row.answers)
      ? { presentationId: selected.presentationId, item: { ...toAssessmentItemDTO(item), instructions: row.followupSince && item.method === 'SELF_REPORT'
        ? `Новая серия: описывайте только другие эпизоды после ${row.followupSince} (UTC) и после вашей попытки выполнения. Не повторяйте ранее описанные случаи. Если нового опыта пока нет, отметьте это. ${item.instructions}` : item.instructions }, phase: selected.phase, hint: selected.phase === 'ASSISTED' ? publication.metadata?.authoredExplanation ?? hint : null } : null,
    profile: published?.status === 'FINALIZED' ? { version: 'assessment-profile-v1', status: ready ? 'READY' : 'PENDING', snapshot: ready ? published.snapshot : null } : null,
    knownEpisodes: row && row.status !== 'DELETED' ? await knownAssessmentEpisodes(ownerId, row, item, session) : [],
  };
}

export type AssessmentCalculationHooks = { afterSourceCommitted?: () => Promise<void>; afterComputed?: () => Promise<void>; beforePersist?: (session: ClientSession) => Promise<void> };

/** Called by the authorized agreement workflow, never by an HTTP score/actor override. */
export async function beginAssessmentFollowup(ownerId: string, session: ClientSession, now = new Date(), publicationId = DOM_S07_PUBLICATION.id, relationshipId?: string): Promise<void> {
  const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
  const row = await readSource(ownerId, session, publicationId);
  if (!row || row.status === 'DELETED' || row.deletionGeneration !== participant.deletionGeneration) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
  if (row.status !== 'FINALIZED' || !row.snapshot || row.materializedRevision !== row.revision || !row.finalizedAt) fail('ASSESSMENT_NOT_FINALIZED', 'Завершите текущее прохождение до новой серии наблюдений.');
  const publication = requirePublication(row);
  await requireAssessmentPublication(publicationId, session);
  if (!assessmentPurposeAllowed(participant, 'OWNER', publicationId)) fail('PUBLICATION_RESTRICTED', 'Публикация не включена в настройки.', 403);
  if (relationshipId && !await Pair.exists({ _id: relationshipId, members: ownerId, status: 'active' }).session(session)) fail('PAIR_UNAVAILABLE', 'Текущая пара недоступна.');
  const newPeriod = publication.metadata ? { id: `${publicationId}:wave:${row.observationRound + 1}`, startsAt: new Date(Math.max(Date.parse(row.period.endsAt), now.getTime() - 28 * 86400000)).toISOString(), endsAt: now.toISOString() } : periodAt(now);
  if (publication.metadata) validateCompletedPeriod(newPeriod);
  await AssessmentRun.updateOne({ _id: row._id, ownerId, revision: row.revision }, { $set: {
    previousSource: { revision: row.revision, period: row.period, answers: row.answers, snapshot: row.snapshot, observationRound: row.observationRound, finalizedAt: row.finalizedAt, contextIdentity: row.contextIdentity ?? 'INDIVIDUAL' },
    contextIdentity: relationshipId ? `PAIR:${relationshipId}` : row.contextIdentity ?? 'INDIVIDUAL',
    followupSince: publication.metadata ? newPeriod.startsAt : now.toISOString(),
    status: 'DRAFT', answers: [], presentations: [], assistedItemIds: publication.items.filter(item => item.method !== 'SELF_REPORT').map(item => item.id), snapshot: null,
    sourceHistory: [...(row.sourceHistory ?? []), { revision: row.revision, period: row.period, answers: row.answers, observationRound: row.observationRound, finalizedAt: row.finalizedAt, contextIdentity: row.contextIdentity ?? 'INDIVIDUAL' }].slice(-12),
    materializedRevision: -1, finalizedAt: null, period: newPeriod,
  }, $inc: { revision: 1, observationRound: 1 } }, { session });
  const portfolio = await AssessmentPortfolio.findOneAndUpdate({ _id: ownerId }, { $setOnInsert: { ownerId, deletionGeneration: participant.deletionGeneration }, $set: { materializedRevision: -1 }, $inc: { sourceSetRevision: 1 } }, { session, upsert: true, new: true }).lean<AssessmentPortfolioType>();
  await enqueueAssessmentProjection({ ownerId, sourceSetRevision: portfolio.sourceSetRevision, deletionGeneration: participant.deletionGeneration }, session);
}

export async function materializeAssessment(ownerId: string, hooks: AssessmentCalculationHooks = {}): Promise<void> {
  const { participant, capturedRows, portfolio, disabled } = await assessmentTransaction(async session => {
    const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
    const capturedRows = await AssessmentRun.find({ ownerId, status: { $ne: 'DELETED' }, deletionGeneration: participant.deletionGeneration }).session(session).limit(64).lean<AssessmentRunType[]>();
    const portfolio = await AssessmentPortfolio.findById(ownerId).session(session).lean<AssessmentPortfolioType | null>();
    return { participant, capturedRows, portfolio, disabled: await assessmentDisabledPublications(session) };
  });
  const pending = capturedRows.filter(row => row.status === 'FINALIZED' && row.materializedRevision !== row.revision && assessmentPurposeAllowed(participant, 'OWNER', row.publicationId) && !disabled.includes(row.publicationId));
  const sourceSetRevision = portfolio?.sourceSetRevision ?? 0;
  const computed = pending.map(row => ({ row, snapshot: computeAssessmentProfile(sourceInput(row)) }));
  const sources = capturedRows.map(currentAssessmentSource).filter(row => row.status === 'FINALIZED' && row.finalizedAt && assessmentPurposeAllowed(participant, 'OWNER', row.publicationId) && !disabled.includes(row.publicationId)).flatMap(row => [sourceInput(row), ...historicalSources(row)]);
  const snapshot = composeAssessmentSources(sources, { purpose: 'OWNER', sourceSetRevision });
  if (!pending.length && portfolio?.materializedRevision === portfolio?.sourceSetRevision && portfolio?.sourceSetIdentity === (snapshot?.sourceSetIdentity ?? null)) return;
  await hooks.afterComputed?.();
  await assessmentTransaction(async session => {
    const current = await requireAssessmentOwner(ownerId, { session, fence: true });
    await hooks.beforePersist?.(session);
    if (JSON.stringify([...(await assessmentDisabledPublications(session))].sort()) !== JSON.stringify([...disabled].sort())) fail('SOURCE_STALE', 'Доступность публикаций изменилась.');
    if (current.deletionGeneration !== participant.deletionGeneration || current.permissionEpoch !== participant.permissionEpoch) fail('SOURCE_STALE', 'Основание изменилось. Обновите страницу.');
    const currentPortfolio = await AssessmentPortfolio.findById(ownerId).session(session).lean<AssessmentPortfolioType | null>();
    if ((currentPortfolio?.sourceSetRevision ?? 0) !== sourceSetRevision) fail('SOURCE_STALE', 'Набор источников изменился. Пересчёт будет повторён.');
    for (const { row, snapshot: sourceSnapshot } of computed) {
      if (!assessmentPurposeAllowed(current, 'OWNER', row.publicationId)) fail('SOURCE_STALE', 'Разрешение изменилось.');
      const saved = await AssessmentRun.updateOne({ _id: row._id, ownerId, status: 'FINALIZED', revision: row.revision, permissionRevision: row.permissionRevision, deletionGeneration: row.deletionGeneration }, { $set: { snapshot: sourceSnapshot, materializedRevision: row.revision } }, { session });
      if (saved.matchedCount !== 1) fail('SOURCE_STALE', 'Основание изменилось. Обновите страницу.');
    }
    await AssessmentPortfolio.updateOne({ _id: ownerId, sourceSetRevision }, { $set: { ownerId, snapshot, sourceSetIdentity: snapshot?.sourceSetIdentity ?? null, materializedRevision: sourceSetRevision, deletionGeneration: current.deletionGeneration }, ...(snapshot ? { $push: { history: { $each: [{ sourceSetRevision, sourceSetIdentity: snapshot.sourceSetIdentity!, computedAt: new Date().toISOString(), snapshot }], $slice: -24 } } } : {}) }, { session, upsert: !currentPortfolio });
  });
}

function sourceInput(row: AssessmentRunType): AssessmentCompositionSource {
  return { subjectId: row.ownerId, sourceId: row._id, revision: row.revision, generation: row.deletionGeneration, period: row.period, answers: row.answers, observationRound: row.observationRound, publication: requirePublication(row), finalizedAt: row.finalizedAt ?? row.updatedAt?.toISOString() ?? new Date(0).toISOString(), permissionRevision: row.permissionRevision, pairUse: row.pairUse, matchingUse: row.matchingUse, contextIdentity: row.contextIdentity ?? 'INDIVIDUAL', exposureHistory: row.exposureHistory };
}
function historicalSources(row: AssessmentRunType): AssessmentCompositionSource[] {
  return (row.sourceHistory ?? []).filter(history => history.period.id !== row.period.id).map(history => ({ ...sourceInput(row), sourceId: `${row._id}:history:${history.observationRound}`, revision: history.revision, period: history.period, answers: history.answers, observationRound: history.observationRound, finalizedAt: history.finalizedAt, contextIdentity: history.contextIdentity ?? row.contextIdentity ?? 'INDIVIDUAL' }));
}

/** Server callers authenticate both actors and their requested relationship before
 * requesting a PAIR view. No OWNER aggregate participates in this computation. */
export async function resolveAssessmentSourceView(ownerId: string, options: { purpose: AssessmentPurpose; relationshipId?: string; session?: ClientSession }): Promise<{ sourceSetRevision: number; sourceSetIdentity: string; generation: number; snapshot: ReturnType<typeof composeAssessmentSources> }> {
  if (!options.session) return assessmentTransaction(session => resolveAssessmentSourceView(ownerId, { ...options, session }));
  const participant = await requireAssessmentOwner(ownerId, { session: options.session, fence: true });
  const portfolio = await AssessmentPortfolio.findById(ownerId).session(options.session ?? null).lean<AssessmentPortfolioType | null>();
  const rows = await AssessmentRun.find({ ownerId, status: { $ne: 'DELETED' }, deletionGeneration: participant.deletionGeneration }).session(options.session ?? null).limit(64).lean<AssessmentRunType[]>();
  const disabled = await assessmentDisabledPublications(options.session);
  const sources = rows.map(currentAssessmentSource).filter(row => row.status === 'FINALIZED' && row.finalizedAt && assessmentPurposeAllowed(participant, options.purpose, row.publicationId) && !disabled.includes(row.publicationId)).flatMap(row => [sourceInput(row), ...historicalSources(row)]);
  const sourceSetRevision = portfolio?.sourceSetRevision ?? 0;
  const snapshot = composeAssessmentSources(sources, { purpose: options.purpose, relationshipId: options.relationshipId, sourceSetRevision });
  return { sourceSetRevision, sourceSetIdentity: assessmentIdentity(snapshot?.sourceSetIdentity ?? 'EMPTY', options.purpose, String(participant.permissionEpoch)), generation: participant.deletionGeneration, snapshot };
}

export async function getOwnerAssessmentProfile(ownerId: string): Promise<OwnerAssessmentProfileDTO | null> {
  if (!isAssessmentEnabled()) return null;
  if (!await AssessmentParticipant.exists({ _id: ownerId })) return null;
  await materializeAssessment(ownerId);
  const view = await resolveAssessmentSourceView(ownerId, { purpose: 'OWNER' });
  const draft = !view.snapshot && await AssessmentRun.exists({ ownerId, status: 'DRAFT' });
  return { version: 'assessment-profile-v1', status: view.snapshot ? 'READY' : draft ? 'DRAFT' : 'NOT_STARTED', snapshot: view.snapshot, unavailableSkills: getUnavailableAssessmentSkills() };
}
async function withComposedProfile(ownerId: string, dto: AssessmentRunDTO, session: ClientSession): Promise<AssessmentRunDTO> {
  if (dto.status === 'DELETED') return dto;
  const view = await resolveAssessmentSourceView(ownerId, { purpose: 'OWNER', session });
  if (!view.snapshot) return { ...dto, profile: null };
  return { ...dto, profile: { version: 'assessment-profile-v1', status: view.snapshot ? 'READY' : dto.status === 'DRAFT' ? 'DRAFT' : 'NOT_STARTED', snapshot: view.snapshot, unavailableSkills: getUnavailableAssessmentSkills() } };
}

/** Owner export is a privacy control: it remains reachable when capture is disabled. */
export async function exportOwnerAssessmentData(ownerId: string) {
  await connectToDatabase();
  await requireAssessmentRecoveryReadable();
  const row = await readSource(ownerId);
  const allRuns = await AssessmentRun.find({ ownerId, status: { $ne: 'DELETED' } }).limit(64).lean<AssessmentRunType[]>();
  const portfolio = await AssessmentPortfolio.findById(ownerId).lean<AssessmentPortfolioType | null>();
  const practices = await AssessmentPractice.find({ ownerId }).limit(100).lean();
  if ((!row || row.status === 'DELETED') && !allRuns.length && !portfolio?.exposures.length && !practices.length) return null;
  const selected = row && row.status !== 'DELETED' ? row : allRuns[0];
  return {
    publicationId: selected?.publicationId ?? null, publicationVersion: selected?.publicationVersion ?? null, status: selected?.status ?? 'DELETED',
    revision: selected?.revision ?? 0, period: selected?.period ?? null, pairUse: selected?.pairUse ?? false, matchingUse: selected?.matchingUse ?? false, permissionRevision: selected?.permissionRevision ?? 0,
    answers: selected?.answers.map(({ itemId, response, phase, revision, recordedAt }) => ({ itemId, response, phase, revision, recordedAt })) ?? [],
    previousSource: selected?.previousSource ?? null,
    snapshot: selected?.status === 'FINALIZED' && selected.materializedRevision === selected.revision ? selected.snapshot : null,
    runs: allRuns.map(run => ({ publicationId: run.publicationId, publicationVersion: run.publicationVersion, contentHash: run.contentHash, revision: run.revision, status: run.status, period: run.period, contextIdentity: run.contextIdentity ?? 'INDIVIDUAL', answers: run.answers, sourceHistory: run.sourceHistory ?? [], pairUse: run.pairUse, matchingUse: run.matchingUse })),
    portfolio: portfolio ? { goal: portfolio.goal, declinedPublicationIds: portfolio.declinedPublicationIds, exposures: portfolio.exposures, sourceSetRevision: portfolio.sourceSetRevision, sourceSetIdentity: portfolio.sourceSetIdentity, snapshot: portfolio.snapshot, history: portfolio.history } : null,
    practices: practices.map(practice => ({ id: practice._id, skillId: practice.skillId, goal: practice.goal, mode: practice.mode, status: practice.status, startedAt: practice.startedAt, reportedAt: practice.reportedAt, note: practice.note, observedAt: practice.observedAt })),
  };
}

export const assessmentRunsService = {
  async getControls(ownerId: string, publicationId = DOM_S07_PUBLICATION.id): Promise<AssessmentRunDTO> {
    return assessmentTransaction(async session => {
      await requireAssessmentOwner(ownerId, { control: true, session, fence: true });
      const row = await readSource(ownerId, session, publicationId);
      const dto = await toDTO(ownerId, row, undefined, publicationId, session);
      return { ...dto, answers: [], items: [], presentation: null, profile: null, calculation: 'NOT_STARTED', period: null, knownEpisodes: [] };
    });
  },
  async get(ownerId: string, publicationId = DOM_S07_PUBLICATION.id): Promise<AssessmentRunDTO> {
    const owner = await requireAssessmentOwner(ownerId);
    await requireAssessmentPublication(publicationId);
    if (!assessmentPurposeAllowed(owner, 'OWNER', publicationId)) fail('PUBLICATION_RESTRICTED', 'Эта публикация не включена в текущие настройки.', 403);
    await materializeAssessment(ownerId);
    return assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
      await requireAssessmentPublication(publicationId, session);
      const row = await readSource(ownerId, session, publicationId);
      if (row && row.status !== 'DELETED' && row.deletionGeneration !== participant.deletionGeneration) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
      return withComposedProfile(ownerId, await toDTO(ownerId, row, undefined, publicationId, session), session);
    });
  },
  async mutate(ownerId: string, input: AssessmentMutation, hooks: AssessmentCalculationHooks = {}): Promise<AssessmentRunDTO> {
    const parsed = AssessmentMutationSchema.safeParse(input);
    if (!parsed.success) fail('VALIDATION_ERROR', 'Недопустимая операция.', 400);
    const mutation = parsed.data;
    const publicationId = mutation.publicationId ?? DOM_S07_PUBLICATION.id;
    const publication = getAssessmentPublication(publicationId);
    if (!publication) fail('CONTENT_VERSION_UNAVAILABLE', 'Публикация недоступна.', 404);
    const control = mutation.action === 'delete' || (mutation.action === 'permission' && !mutation.pairUse) || (mutation.action === 'matching-permission' && !mutation.matchingUse);
    const owner = await requireAssessmentOwner(ownerId, { control });
    if (!control && !assessmentPurposeAllowed(owner, 'OWNER', publicationId)) fail('PUBLICATION_RESTRICTED', 'Эта публикация не включена в текущие настройки.', 403);
    if (!control) await requireAssessmentEffect('SUBMISSIONS');
    if (!control) await requireAssessmentPublication(publicationId);
    if (mutation.viewerToken !== await viewerToken(ownerId, publicationId)) fail('VIEWER_CONTEXT_STALE', 'Аккаунт изменился. Обновите страницу.');
    if (mutation.action === 'retry') return this.get(ownerId, publicationId);
    const normalized = mutation.action === 'answer' && mutation.response.kind === 'FACTS'
      ? { ...mutation, response: { ...mutation.response, values: Object.fromEntries(Object.entries(mutation.response.values).sort(([a], [b]) => a.localeCompare(b))) } } : mutation;
    const requestHash = assessmentIdentity(JSON.stringify(normalized));
    await assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, control, fence: true });
      if (!control) await requireAssessmentEffect('SUBMISSIONS', session);
      if (!control) await requireAssessmentPublication(publicationId, session);
      if (mutation.viewerToken !== await viewerToken(ownerId, publicationId, session)) fail('VIEWER_CONTEXT_STALE', 'Настройки или аккаунт изменились. Обновите страницу.');
      const operationId = assessmentIdentity(runId(ownerId, publicationId), mutation.idempotencyKey);
      const previous = await AssessmentOperation.findById(operationId).session(session).lean();
      if (previous) {
        if (previous.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого изменения.');
        return;
      }
      let row = await readSource(ownerId, session, publicationId);
      if (!row) {
        if (mutation.action !== 'start') fail('ASSESSMENT_NOT_STARTED', 'Сначала откройте анкету.');
        const period = mutation.period ?? periodAt(new Date());
        if (publication.metadata?.samplingFrame === 'SELECTED_DESCRIBED_EPISODES') validateCompletedPeriod(period);
        const exposure = await AssessmentPortfolio.findById(ownerId).session(session).lean<AssessmentPortfolioType | null>();
        const assistedItemIds = exposure?.exposures.some(entry => entry.skillId === publication.skillId) || participant.deletionGeneration > 0 ? publication.items.map(item => item.id) : [];
        const created = await AssessmentRun.create([{ _id: runId(ownerId, publicationId), ownerId, publicationId: publication.id, publicationVersion: publication.version, contentHash: assessmentPublicationHash(publication), deletionGeneration: participant.deletionGeneration, period, goal: mutation.goal ?? 'SELF', contextIdentity: 'INDIVIDUAL', assistedItemIds, exposureHistory: participant.deletionGeneration > 0 ? 'UNKNOWN_AFTER_DELETION' : assistedItemIds.length ? 'EXPLANATION_RECORDED' : 'NOT_RECORDED', pairUse: participant.settings?.pairSharing ?? false, matchingUse: participant.settings?.discovery ?? false }], { session });
        row = created[0].toObject();
      }
      requirePublication(row);
      if (row.status === 'DELETED') fail('SOURCE_UNAVAILABLE', 'Ответы удалены.');
      if (row.deletionGeneration !== participant.deletionGeneration) fail('SOURCE_UNAVAILABLE', 'Основание недоступно.');
      if (mutation.action !== 'start' && row.revision !== mutation.expectedRevision) {
        await recordAssessmentOps('SOURCE_CAS_CONFLICT', 'WORKER').catch(() => undefined);
        fail('ASSESSMENT_STALE', 'Анкета изменена в другой вкладке. Обновите страницу.');
      }
      if (mutation.action === 'permission') {
        if (row.pairUse !== mutation.pairUse) { row.pairUse = mutation.pairUse; row.permissionRevision++; row.revision++; row.snapshot = null; row.materializedRevision = -1; }
      } else if (mutation.action === 'matching-permission') {
        if (row.matchingUse !== mutation.matchingUse) { row.matchingUse = mutation.matchingUse; row.permissionRevision++; row.revision++; row.snapshot = null; row.materializedRevision = -1; }
      } else if (mutation.action === 'delete') {
        row.status = 'DELETED'; row.answers = []; row.presentations = []; row.assistedItemIds = []; row.snapshot = null; row.previousSource = null; row.followupSince = null;
        row.pairUse = false; row.matchingUse = false; row.permissionRevision++; row.deletionGeneration++; row.revision++; row.materializedRevision = -1;
        await AssessmentParticipant.updateOne({ _id: ownerId, deletionGeneration: participant.deletionGeneration }, { $inc: { deletionGeneration: 1 } }, { session });
        await AssessmentRun.updateMany({ ownerId, _id: { $ne: row._id }, status: { $ne: 'DELETED' }, deletionGeneration: participant.deletionGeneration }, { $set: { deletionGeneration: participant.deletionGeneration + 1 } }, { session });
        await AssessmentPractice.updateMany({ ownerId, deletionGeneration: participant.deletionGeneration }, { $set: { deletionGeneration: participant.deletionGeneration + 1 } }, { session });
        await AssessmentPortfolio.updateOne({ _id: ownerId }, { $set: { snapshot: null, history: [], sourceSetIdentity: null, deletionGeneration: participant.deletionGeneration + 1 }, $pull: { exposures: { publicationId } } }, { session });
        row.sourceHistory = [];
        await AssessmentOperation.deleteMany({ ownerId }, { session });
      } else if (mutation.action === 'followup') {
        if (row.status !== 'FINALIZED' || !row.snapshot || !row.finalizedAt || row.materializedRevision !== row.revision) fail('ASSESSMENT_NOT_FINALIZED', 'Сначала завершите текущую серию.');
        if (publication.metadata?.samplingFrame !== 'SELECTED_DESCRIBED_EPISODES') fail('FOLLOWUP_UNAVAILABLE', 'Новая наблюдательная серия доступна для описанного применения.');
        validateCompletedPeriod(mutation.period);
        if (Date.parse(mutation.period.startsAt) < Date.parse(row.period.endsAt)) fail('ASSESSMENT_PERIOD_OVERLAP', 'Новая серия должна относиться к следующему завершённому периоду.', 400);
        row.previousSource = { revision: row.revision, period: row.period, answers: row.answers, snapshot: row.snapshot, observationRound: row.observationRound, finalizedAt: row.finalizedAt, contextIdentity: row.contextIdentity ?? 'INDIVIDUAL' };
        row.sourceHistory = [...(row.sourceHistory ?? []), { revision: row.revision, period: row.period, answers: row.answers, observationRound: row.observationRound, finalizedAt: row.finalizedAt, contextIdentity: row.contextIdentity ?? 'INDIVIDUAL' }].slice(-12);
        row.period = mutation.period; row.answers = []; row.presentations = []; row.snapshot = null; row.materializedRevision = -1; row.status = 'DRAFT'; row.observationRound++; row.revision++; row.finalizedAt = null;
      } else if (mutation.action === 'revise') {
        if (publication.metadata && row.status === 'FINALIZED') {
          if (!row.snapshot || row.materializedRevision !== row.revision || !row.finalizedAt) fail('ASSESSMENT_NOT_FINALIZED', 'Сначала дождитесь расчёта сохранённого результата.');
          // Keep the completed permitted input during editing. Otherwise merely
          // opening a private NEG correction would expose a temporary deficit.
          // Finalize replaces this source atomically; permissions still use the
          // live row and may withdraw access immediately.
          row.previousSource = { revision: row.revision, period: row.period, answers: row.answers, snapshot: row.snapshot, observationRound: row.observationRound, finalizedAt: row.finalizedAt, contextIdentity: row.contextIdentity ?? 'INDIVIDUAL' };
        }
        row.status = 'DRAFT'; row.snapshot = null; row.materializedRevision = -1; row.presentations = []; row.revision++;
      } else if (mutation.action !== 'start') {
        if (row.status !== 'DRAFT') fail('ASSESSMENT_FINALIZED', 'Ответы завершены. Для исправления откройте новую редакцию.');
        if (mutation.action === 'finalize') {
          if (publication.items.some(item => isAssessmentItemAvailable(item, row.answers) && !row.answers.some(answer => answer.itemId === item.id))) fail('ASSESSMENT_INCOMPLETE', 'Ответьте на доступные вопросы или явно пропустите их.', 400);
          row.status = 'FINALIZED'; row.finalizedAt = new Date().toISOString(); row.revision++; row.materializedRevision = -1; row.snapshot = null; row.previousSource = null;
        } else {
          const receipt = mutation.action === 'answer' ? row.presentations.find(item => item.presentationId === mutation.presentationId) : null;
          const itemId = mutation.action === 'answer' ? receipt?.itemId : mutation.itemId;
          const item = publication.items.find(candidate => candidate.id === itemId);
          if (!item || !isAssessmentItemAvailable(item, row.answers)) fail('PRESENTATION_UNAVAILABLE', 'Этот вопрос сейчас недоступен.');
          const parentRevision = item.dependsOn ? row.answers.find(answer => answer.itemId === item.dependsOn!.itemId)?.revision ?? null : null;
          if (mutation.action === 'answer') {
            AssessmentAnswerInputSchema.parse({ presentationId: mutation.presentationId, expectedRevision: mutation.expectedRevision, idempotencyKey: mutation.idempotencyKey, response: mutation.response });
            if (!receipt || receipt.parentRevision !== parentRevision || receipt.phase !== phaseFor(row, item)) fail('PRESENTATION_STALE', 'Предъявление изменилось. Откройте вопрос снова.');
            let response;
            try { response = parseAssessmentResponse(item, mutation.response); } catch { return fail('VALIDATION_ERROR', 'Недопустимый ответ для этого вопроса.', 400); }
            if (publication.metadata && response.kind === 'FACTS') {
              if (!response.episode || Date.parse(response.episode.observedAt) < Date.parse(row.period.startsAt) || Date.parse(response.episode.observedAt) >= Date.parse(row.period.endsAt)) fail('ASSESSMENT_OBSERVATION_DATE_REQUIRED', 'Укажите дату события в выбранном периоде.', 400);
              if (response.episode.sameEpisodeRootId) {
                const reference = response.episode;
                const knownRoot = (await knownAssessmentEpisodes(ownerId, row, item, session)).some(episode => episode.rootId === reference.sameEpisodeRootId && episode.observedAt === reference.observedAt);
                if (!knownRoot) fail('ASSESSMENT_EPISODE_REFERENCE_UNAVAILABLE', 'Выберите свой ранее описанный эпизод этой серии.', 400);
              }
            }
            row.revision++;
            row.answers = row.answers.filter(answer => answer.itemId !== item.id);
            row.answers.push({ presentationId: receipt.presentationId, itemId: item.id, response, revision: row.revision, phase: receipt.phase, recordedAt: new Date().toISOString() });
            // Parent corrections replace dependent observations, even when the option stays the same.
            const descendants = publication.items.filter(candidate => candidate.dependsOn?.itemId === item.id).map(candidate => candidate.id);
            row.answers = row.answers.filter(answer => !descendants.includes(answer.itemId));
            row.presentations = row.presentations.filter(candidate => !descendants.includes(candidate.itemId));
          } else {
            const exposed = mutation.action === 'hint' ? [item.id, ...(item.exposureFor ?? [])] : item.exposureFor ?? [];
            for (const id of exposed) if (!row.assistedItemIds.includes(id)) row.assistedItemIds.push(id);
            if (mutation.action === 'hint') row.answers = row.answers.filter(answer => answer.itemId !== item.id);
            if (mutation.action === 'hint' && row.exposureHistory !== 'UNKNOWN_AFTER_DELETION') row.exposureHistory = 'EXPLANATION_RECORDED';
            if (mutation.action === 'hint') await AssessmentPortfolio.updateOne({ _id: ownerId }, { $setOnInsert: { ownerId, deletionGeneration: participant.deletionGeneration }, $push: { exposures: { $each: [{ skillId: publication.skillId, publicationId, viewedAt: new Date().toISOString(), accessibilitySupport: 'NONE' }], $slice: -100 } } }, { session, upsert: true });
            row.presentations = row.presentations.filter(candidate => candidate.itemId !== item.id && !exposed.includes(candidate.itemId));
            row.revision++;
            row.presentations.push({ presentationId: randomUUID(), itemId: item.id, issuedRevision: row.revision, parentRevision, phase: phaseFor(row, item), issuedAt: new Date().toISOString() });
          }
        }
      }
      const { _id, createdAt, updatedAt, ...changes } = row;
      void createdAt; void updatedAt;
      await AssessmentRun.updateOne({ _id, ownerId }, { $set: changes }, { session });
      const portfolio = await AssessmentPortfolio.findOneAndUpdate({ _id: ownerId }, { $setOnInsert: { ownerId }, $set: { deletionGeneration: row.deletionGeneration, materializedRevision: -1 }, $inc: { sourceSetRevision: 1 } }, { session, upsert: true, new: true }).lean<AssessmentPortfolioType>();
      if (!control) await enqueueAssessmentProjection({ ownerId, sourceSetRevision: portfolio.sourceSetRevision, deletionGeneration: participant.deletionGeneration }, session);
      await AssessmentOperation.create([{ _id: operationId, ownerId, requestHash, committedRevision: row.revision }], { session });
    });
    await recordAssessmentOps(control ? 'SOURCE_INVALIDATED' : 'SOURCE_COMMITTED', 'WORKER').catch(() => undefined);
    await hooks.afterSourceCommitted?.();
    if (!control) await materializeAssessment(ownerId, hooks);
    return assessmentTransaction(async session => {
      await requireAssessmentOwner(ownerId, { control, session, fence: true });
      const row = await readSource(ownerId, session, publicationId);
      const itemId = mutation.action === 'present' || mutation.action === 'hint' ? mutation.itemId : undefined;
      const dto = await toDTO(ownerId, row, itemId, publicationId, session);
      return control ? dto : withComposedProfile(ownerId, dto, session);
    });
  },
};
