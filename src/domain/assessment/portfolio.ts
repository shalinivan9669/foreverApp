import { createHash } from 'node:crypto';
import { AssessmentPortfolio, type AssessmentPortfolioType } from '@/models/AssessmentPortfolio';
import { AssessmentPractice, type AssessmentPracticeType } from '@/models/AssessmentPractice';
import { AssessmentOperation, AssessmentRun, type AssessmentRunType } from '@/models/AssessmentRun';
import { assessmentDisabledPublications, assessmentFail as fail, assessmentPurposeAllowed, assessmentTransaction, assessmentViewerIntent, requireAssessmentEffect, requireAssessmentOwner, requireAssessmentPublication } from '@/domain/services/assessmentAccess.service';
import { getOwnerAssessmentProfile } from '@/domain/services/assessmentRuns.service';
import { getAssessmentPublication, listAssessmentPublications } from './publication';
import { ASSESSMENT_PRACTICES, AssessmentPortfolioMutationSchema, planAssessmentNextStep, type AssessmentPortfolioDTO, type AssessmentPortfolioMutation, type AssessmentPracticeDTO } from './planner';

const identity = (...values: string[]) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const viewerToken = (ownerId: string) => assessmentViewerIntent(ownerId, 'assessment-portfolio-v1');
const practiceDTO = (row: AssessmentPracticeType): AssessmentPracticeDTO => ({ id: row._id, skillId: row.skillId, goal: row.goal, mode: row.mode, revision: row.revision, status: row.status, startedAt: row.startedAt, reportedAt: row.reportedAt, note: row.note, observedAt: row.observedAt });

export const assessmentPortfolioService = {
  async get(ownerId: string): Promise<AssessmentPortfolioDTO> {
    await requireAssessmentOwner(ownerId);
    const profile = await getOwnerAssessmentProfile(ownerId) ?? { version: 'assessment-profile-v1' as const, status: 'NOT_STARTED' as const, snapshot: null };
    return assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
      const portfolio = await AssessmentPortfolio.findById(ownerId).session(session).lean<AssessmentPortfolioType | null>();
      const runs = await AssessmentRun.find({ ownerId }).session(session).select('publicationId status').limit(64).lean<AssessmentRunType[]>();
      const practices = await AssessmentPractice.find({ ownerId, deletionGeneration: participant.deletionGeneration }).session(session).sort({ startedAt: -1 }).limit(30).lean<AssessmentPracticeType[]>();
      const disabled = await assessmentDisabledPublications(session);
      const publications = listAssessmentPublications().filter(publication => assessmentPurposeAllowed(participant, 'OWNER', publication.id) && !disabled.includes(publication.id)).map(publication => ({ ...publication, runStatus: runs.find(run => run.publicationId === publication.id)?.status ?? 'NEW' as const, declined: portfolio?.declinedPublicationIds.includes(publication.id) ?? false }));
      const goal = portfolio?.goal ?? 'SELF';
      // The profile is authorized again in this fenced snapshot: a concurrent
      // permission change cannot return a previously read private projection.
      const validProfile = portfolio?.snapshot?.sourceSetIdentity === profile.snapshot?.sourceSetIdentity && portfolio?.materializedRevision === portfolio?.sourceSetRevision ? profile : { version: 'assessment-profile-v1' as const, status: profile.snapshot ? 'PENDING' as const : 'NOT_STARTED' as const, snapshot: null, unavailableSkills: profile.unavailableSkills };
      return { viewerToken: await assessmentViewerIntent(ownerId, 'assessment-portfolio-v1', session), revision: portfolio?.revision ?? 0, goal, profile: validProfile, publications, planner: planAssessmentNextStep({ goal, publications, profile: validProfile }), practiceCatalog: ASSESSMENT_PRACTICES, practices: practices.map(practiceDTO) };
    });
  },
  async mutate(ownerId: string, input: AssessmentPortfolioMutation): Promise<AssessmentPortfolioDTO> {
    const parsed = AssessmentPortfolioMutationSchema.safeParse(input);
    if (!parsed.success) fail('VALIDATION_ERROR', 'Недопустимое изменение.', 400);
    const mutation = parsed.data;
    await requireAssessmentOwner(ownerId);
    if (mutation.viewerToken !== await viewerToken(ownerId)) fail('VIEWER_CONTEXT_STALE', 'Аккаунт изменился. Обновите страницу.');
    await requireAssessmentEffect('SUBMISSIONS');
    await assessmentTransaction(async session => {
      const participant = await requireAssessmentOwner(ownerId, { session, fence: true });
      await requireAssessmentEffect('SUBMISSIONS', session);
      if (mutation.viewerToken !== await assessmentViewerIntent(ownerId, 'assessment-portfolio-v1', session)) fail('VIEWER_CONTEXT_STALE', 'Настройки или аккаунт изменились. Обновите страницу.');
      const operationId = identity('portfolio-operation', ownerId, mutation.idempotencyKey);
      const requestHash = identity(JSON.stringify(mutation));
      const previous = await AssessmentOperation.findById(operationId).session(session).lean();
      if (previous) { if (previous.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Ключ уже относится к другому изменению.'); return; }
      const row = await AssessmentPortfolio.findById(ownerId).session(session).lean<AssessmentPortfolioType | null>();
      if ((row?.revision ?? 0) !== mutation.expectedRevision) fail('ASSESSMENT_STALE', 'Данные изменились в другой вкладке. Обновите страницу.');
      if (!row) await AssessmentPortfolio.create([{ _id: ownerId, ownerId, deletionGeneration: participant.deletionGeneration }], { session });
      if ('publicationId' in mutation && (!getAssessmentPublication(mutation.publicationId) || !assessmentPurposeAllowed(participant, 'OWNER', mutation.publicationId))) fail('PUBLICATION_RESTRICTED', 'Публикация недоступна.', 403);
      if ('publicationId' in mutation) await requireAssessmentPublication(mutation.publicationId, session);
      if (mutation.action === 'goal') await AssessmentPortfolio.updateOne({ _id: ownerId }, { $set: { goal: mutation.goal } }, { session });
      if (mutation.action === 'decline') await AssessmentPortfolio.updateOne({ _id: ownerId }, { $addToSet: { declinedPublicationIds: mutation.publicationId } }, { session });
      if (mutation.action === 'explanation') {
        const publication = getAssessmentPublication(mutation.publicationId)!;
        await AssessmentPortfolio.updateOne({ _id: ownerId }, { $push: { exposures: { $each: [{ publicationId: publication.id, skillId: publication.skillId, viewedAt: new Date().toISOString(), accessibilitySupport: mutation.accessibilitySupport }], $slice: -100 } } }, { session });
        // Accessibility support is recorded, never a lower result. A substantive
        // explanation marks later answers assisted across the same skill forms.
        const related = listAssessmentPublications().filter(candidate => candidate.skillId === publication.skillId);
        for (const candidate of related) await AssessmentRun.updateOne({ ownerId, publicationId: candidate.id, status: { $ne: 'DELETED' } }, { $addToSet: { assistedItemIds: { $each: getAssessmentPublication(candidate.id)!.items.map(item => item.id) } } }, { session });
      }
      if (mutation.action === 'practice-start') {
        const publicationId = `${mutation.skillId.toLowerCase().replace('.', '-')}-application-beta`;
        await requireAssessmentPublication(publicationId, session);
        if (!assessmentPurposeAllowed(participant, 'OWNER', publicationId)) fail('PUBLICATION_RESTRICTED', 'Тема не включена в настройки.', 403);
        if (await AssessmentPractice.countDocuments({ ownerId, status: 'STARTED' }).session(session) >= 3) fail('PRACTICE_LIMIT', 'Сначала отметьте результат одной из начатых практик.', 429);
        await AssessmentPractice.create([{ _id: `practice:${identity(ownerId, mutation.idempotencyKey)}`, ownerId, skillId: mutation.skillId, publicationId, goal: mutation.goal, mode: mutation.mode, deletionGeneration: participant.deletionGeneration, startedAt: new Date().toISOString() }], { session });
      }
      if (mutation.action === 'practice-report') {
        const practice = await AssessmentPractice.findOne({ _id: mutation.practiceId, ownerId, deletionGeneration: participant.deletionGeneration }).session(session).lean<AssessmentPracticeType | null>();
        if (!practice) fail('NOT_FOUND', 'Практика недоступна.', 404);
        if (practice.revision !== mutation.practiceRevision) fail('ASSESSMENT_STALE', 'Отчёт изменился. Обновите страницу.');
        if (mutation.observedAt && (Date.parse(mutation.observedAt) < Date.parse(practice.startedAt) || Date.parse(mutation.observedAt) > Date.now())) fail('INVALID_OBSERVATION_DATE', 'Укажите дату после начала практики и не позже текущего времени.', 400);
        await AssessmentPractice.updateOne({ _id: practice._id, ownerId, revision: practice.revision }, { $set: { status: mutation.status, note: mutation.note, observedAt: mutation.observedAt, reportedAt: new Date().toISOString() }, $inc: { revision: 1 } }, { session });
      }
      // Practice/report/goal never mutate a source, its source-set revision or actual profile.
      await AssessmentPortfolio.updateOne({ _id: ownerId, revision: mutation.expectedRevision }, { $inc: { revision: 1 } }, { session });
      await AssessmentOperation.create([{ _id: operationId, ownerId, requestHash, committedRevision: mutation.expectedRevision + 1 }], { session });
    });
    return this.get(ownerId);
  },
};
