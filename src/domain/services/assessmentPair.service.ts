import type { ClientSession } from 'mongoose';
import { comparePairReports, agreementStatus, type AgreementVersion, type PairReport } from '@/domain/assessment/engine/pair';
import { assessmentEnvelopeSchema, compareTemporalPairReports, isAssessmentEnvelopeCurrent, type TimedAssessmentPairReport } from '@/domain/assessment/boundaries';
import { AssessmentCurrentComparisonSchema, AssessmentConditionalScenarioSchema } from '@/lib/dto/assessmentComparison.dto';
import { AssessmentPairMutationSchema, type AssessmentPairDTO, type AssessmentPairMutation } from '@/lib/dto/assessmentPair.dto';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { privacySubjectHash } from '@/lib/privacy/subjectHash';
import { Pair } from '@/models/Pair';
import { AssessmentRun, AssessmentOperation, type AssessmentRunType } from '@/models/AssessmentRun';
import { AssessmentDirect } from '@/models/AssessmentDirect';
import { AssessmentComparison } from '@/models/AssessmentComparison';
import { AssessmentPairWork, AssessmentPairReport, type AssessmentPairWorkType, type AssessmentPairReportType } from '@/models/AssessmentPairWork';
import { MatchingBlock } from '@/models/MatchingBlock';
import { SessionSubject } from '@/models/SessionSubject';
import { assessmentFail as fail, assessmentTransaction, requireAssessmentOwner } from './assessmentAccess.service';
import { assessmentIdentity, beginAssessmentFollowup, currentAssessmentSource } from './assessmentRuns.service';
import { captureAssessmentComparisonScope, assessmentEnvelopeForScope, assessmentProjectionMatchesEnvelope } from './assessmentComparison.service';

type PairScope = { pairId: string; actors: [string, string]; myRole: 'A' | 'B'; dependencyHash: string };
export type AssessmentPairHooks = { now?: Date; afterPrepared?: () => Promise<void> };
const metricId = 'household-load-acceptability';
const scaleVersion = 'household-report-v1';
const content = 'Участник А организует полный цикл приготовления еды; участник Б — полный цикл закупки продуктов. Каждый замечает задачу, планирует, организует выполнение и проверяет результат. Изменение нагрузки, помощь или отмена обсуждаются отдельно. Это добровольная бытовая договорённость; согласие можно отозвать. Она не создаёт обязательства на интимность или личное раскрытие.';
const workId = (pairId: string) => assessmentIdentity('assessment-pair-work-v1', pairId);
const intentContext = (ownerId: string, pairId: string) => ({ pairId, viewerToken: assessmentIdentity('assessment-pair-viewer-intent-v1', ownerId, pairId) });

async function pairScope(ownerId: string, session: ClientSession, control = false, requestedPairId?: string): Promise<PairScope | null> {
  await requireAssessmentOwner(ownerId, { session, control, fence: true });
  if (control) {
    // Privacy controls touch only the owner's report or withdraw the common
    // agreement. Historical membership is sufficient; no peer data is returned.
    const historical = await Pair.findOne({ ...(requestedPairId ? { _id: requestedPairId } : {}), members: ownerId }).sort({ createdAt: -1 }).session(session).lean();
    if (!historical || historical.members.length !== 2) return null;
    await Pair.updateOne({ _id: historical._id, members: ownerId }, { $currentDate: { updatedAt: true } }, { session });
    return { pairId: String(historical._id), actors: [historical.members[0], historical.members[1]], myRole: historical.members[0] === ownerId ? 'A' : 'B',
      dependencyHash: assessmentIdentity('assessment-pair-privacy-control-v1', String(historical._id), String(historical.lifecycleRevision ?? 0), ownerId) };
  }
  const candidate = await Pair.findOne({ members: ownerId, status: 'active' }).session(session).lean();
  if (!candidate || !(await requirePairMember(String(candidate._id), ownerId)).ok) return null;
  const pair = await Pair.findOneAndUpdate({ _id: candidate._id, members: ownerId, status: 'active' }, { $currentDate: { updatedAt: true } }, { session, new: true }).lean();
  if (!pair || pair.members.length !== 2) return null;
  const bindings: { ownerId: string; permissionRevision: number; directPermissionRevision: number; deletionGeneration: number; accountGeneration: string }[] = [];
  let cohort: string | null = null;
  for (const actor of [...pair.members].sort()) {
    const enrolled = await requireAssessmentOwner(actor, { session, control, fence: true });
    if (cohort !== null && cohort !== enrolled.cohortId) return null;
    cohort = enrolled.cohortId;
    const run = await AssessmentRun.findOne({ ownerId: actor, status: { $ne: 'DELETED' } }).session(session).lean<AssessmentRunType | null>();
    const direct = await AssessmentDirect.findOne({ ownerId: actor, status: 'ACTIVE' }).session(session).lean();
    const account = await SessionSubject.findOne({ subjectKey: privacySubjectHash(actor) }).session(session).select({ version: 1 }).lean();
    if (!run || !direct || !account || run.deletionGeneration !== enrolled.deletionGeneration || direct.deletionGeneration !== enrolled.deletionGeneration) return null;
    if (!control && (!run.pairUse || !direct.pairUse)) return null;
    const source = currentAssessmentSource(run);
    if (!control && source.snapshot?.skills.some(skill => skill.NMinus.some(pattern => pattern.protectiveRoute))) return null;
    bindings.push({ ownerId: actor, permissionRevision: run.permissionRevision, directPermissionRevision: direct.permissionRevision, deletionGeneration: enrolled.deletionGeneration, accountGeneration: account.version });
  }
  if (!control && await MatchingBlock.exists({ status: 'ACTIVE', $or: [{ blockerId: pair.members[0], blockedId: pair.members[1] }, { blockerId: pair.members[1], blockedId: pair.members[0] }] }).session(session)) return null;
  return { pairId: String(pair._id), actors: [pair.members[0], pair.members[1]], myRole: pair.members[0] === ownerId ? 'A' : 'B',
    dependencyHash: assessmentIdentity('assessment-pair-access-v1', String(pair._id), String(pair.lifecycleRevision ?? 0), JSON.stringify(bindings)) };
}

function asAgreement(row: AssessmentPairWorkType, scope: PairScope): AgreementVersion {
  return { id: row._id, pairId: row.pairId, revision: row.contentRevision, contentHash: row.contentHash, kind: 'ORDINARY_TASK', revoked: row.revoked,
    confirmations: row.confirmations.filter(value => scope.actors.includes(value.ownerId)).map(value => ({ actor: value.ownerId === scope.actors[0] ? 'A' : 'B', agreementRevision: value.contentRevision, contentHash: value.contentHash, decision: 'T' })) };
}
function periods(row: AssessmentPairWorkType, now: Date): AssessmentPairDTO['periods'] {
  if (!row.activeAt) return [];
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const result: AssessmentPairDTO['periods'] = [];
  for (let index = 0; index < 4; index++) {
    let start = new Date(day.getTime() - index * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    if (end.getTime() <= Date.parse(row.activeAt)) continue;
    const firstDay = new Date(`${row.activeAt.slice(0, 10)}T00:00:00.000Z`);
    if (start < firstDay) start = firstDay;
    const window = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), definitionVersion: 'pair-report-utc-week-v1' };
    result.push({ id: `pair-week:${window.start}`, window, label: `${window.start} — ${new Date(end.getTime() - 86_400_000).toISOString().slice(0, 10)} (UTC)${now < end ? ', период ещё не завершён' : ''}` });
  }
  return result;
}
function asReport(row: AssessmentPairReportType, scope: PairScope): TimedAssessmentPairReport {
  return { actor: row.ownerId === scope.actors[0] ? 'A' : 'B', authorId: row.ownerId, pairId: row.pairId, period: row.periodId,
    metricId, scaleVersion, value: row.value, shared: row.shared, agreementRevision: row.contentRevision,
    context: 'ordinary-household-load-v1', window: row.window };
}
const empty = (revision = 0, context: AssessmentPairDTO['context'] = null): AssessmentPairDTO => ({ context, availability: 'UNAVAILABLE', revision, myRole: null, agreement: null, periods: [], reports: [] });

async function readPair(ownerId: string, now: Date, control = false, requestedPairId?: string): Promise<AssessmentPairDTO> {
  return assessmentTransaction(async session => {
    const scope = await pairScope(ownerId, session, control, requestedPairId);
    if (!scope) return empty();
    const row = await AssessmentPairWork.findById(workId(scope.pairId)).session(session).lean<AssessmentPairWorkType | null>();
    const context = intentContext(ownerId, scope.pairId);
    if (control) return empty(row?.revision ?? 0, context);
    if (!row) return { ...empty(0, context), availability: 'AVAILABLE', myRole: scope.myRole };
    if (row.dependencyHash !== scope.dependencyHash) return empty(row.revision, context);
    const status = agreementStatus(asAgreement(row, scope), scope.pairId);
    if (status !== 'ACTIVE' && status !== 'NEEDS_TWO_CONFIRMATIONS' && status !== 'REVOKED') return empty(row.revision, context);
    if (status === 'NEEDS_TWO_CONFIRMATIONS') {
      const basis = assessmentEnvelopeSchema.safeParse(row.basisEnvelope);
      if (!basis.success || !scope.actors.includes(basis.data.viewerId)) return empty(row.revision, context);
      const current = await captureAssessmentComparisonScope(basis.data.viewerId, 'MATCHING', session);
      if (!current || !isAssessmentEnvelopeCurrent(basis.data, assessmentEnvelopeForScope(current, basis.data.viewerId, { actionIds: [], limits: basis.data.searchLimits, completeness: basis.data.completeness }))) return empty(row.revision, context);
    }
    const windows = status === 'REVOKED' ? [] : periods(row, now);
    const reports = (await AssessmentPairReport.find({ pairId: scope.pairId, contentRevision: row.contentRevision, ownerId: { $in: scope.actors } }).session(session).sort({ 'window.start': -1 }).limit(104).lean<AssessmentPairReportType[]>()).reverse();
    const currentReports = windows.map(period => {
      const a = reports.find(report => report.ownerId === scope.actors[0] && report.periodId === period.id);
      const b = reports.find(report => report.ownerId === scope.actors[1] && report.periodId === period.id);
      const own = scope.myRole === 'A' ? a : b;
      const fallback = (actor: 'A' | 'B'): PairReport => ({ actor, pairId: scope.pairId, period: period.id, metricId, scaleVersion, value: null, shared: false });
      const shared = comparePairReports(a ? asReport(a, scope) : fallback('A'), b ? asReport(b, scope) : fallback('B'), scope.pairId);
      const previous = own ? reports.filter(report => report.ownerId === ownerId && report.window.end <= own.window.start).at(-1) : undefined;
      return { periodId: period.id, own: own?.value ?? null, ownRecorded: Boolean(own), ownShared: own?.shared ?? false, A: shared.a, B: shared.b, status: shared.status,
        ownTrend: own && previous && Date.parse(own.recordedAt) >= Date.parse(own.window.end) && Date.parse(previous.recordedAt) >= Date.parse(previous.window.end)
          ? compareTemporalPairReports(asReport(previous, scope), asReport(own, scope)) : 'UNKNOWN' as const };
    });
    return { context, availability: 'AVAILABLE', revision: row.revision, myRole: scope.myRole, periods: windows, reports: currentReports,
      agreement: { contentRevision: row.contentRevision, title: 'Добровольная бытовая договорённость', content: row.content, assumptions: row.assumptions,
        status, confirmations: { A: row.confirmations.some(value => value.ownerId === scope.actors[0] && value.contentRevision === row.contentRevision && value.contentHash === row.contentHash), B: row.confirmations.some(value => value.ownerId === scope.actors[1] && value.contentRevision === row.contentRevision && value.contentHash === row.contentHash) }, currentSkillChanged: false } };
  });
}

export const assessmentPairService = {
  getControls(ownerId: string, requestedPairId?: string) {
    if (requestedPairId && !/^[a-f0-9]{24}$/.test(requestedPairId)) fail('VALIDATION_ERROR', 'Недопустимый контекст пары.', 400);
    return readPair(ownerId, new Date(), true, requestedPairId);
  },
  get(ownerId: string, hooks: AssessmentPairHooks = {}) { return readPair(ownerId, hooks.now ?? new Date()); },
  async mutate(ownerId: string, input: AssessmentPairMutation, hooks: AssessmentPairHooks = {}): Promise<AssessmentPairDTO> {
    const parsed = AssessmentPairMutationSchema.safeParse(input);
    if (!parsed.success) fail('VALIDATION_ERROR', 'Недопустимая операция.', 400);
    const mutation = parsed.data;
    const control = mutation.action === 'revoke' || mutation.action === 'revoke-report';
    await requireAssessmentOwner(ownerId, { control });
    if (mutation.context.viewerToken !== intentContext(ownerId, mutation.context.pairId).viewerToken) fail('VIEWER_CONTEXT_STALE', 'Аккаунт изменился. Обновите страницу.');
    const prepared = await assessmentTransaction(session => pairScope(ownerId, session, control, mutation.context.pairId));
    if (!prepared) fail('NOT_FOUND', 'Область пары недоступна.', 404);
    if (prepared.pairId !== mutation.context.pairId) fail('PAIR_CONTEXT_STALE', 'Выбрана другая пара. Обновите страницу.');
    await hooks.afterPrepared?.();
    await assessmentTransaction(async session => {
      const scope = await pairScope(ownerId, session, control, mutation.context.pairId);
      if (!scope || scope.pairId !== prepared.pairId || scope.dependencyHash !== prepared.dependencyHash) fail('PAIR_CONTEXT_STALE', 'Контекст пары или разрешение изменились.');
      const id = workId(scope.pairId), operationId = assessmentIdentity('assessment-pair-operation-v1', ownerId, id, mutation.idempotencyKey);
      const requestHash = assessmentIdentity(JSON.stringify(mutation));
      const receipt = await AssessmentOperation.findById(operationId).session(session).lean();
      if (receipt) { if (receipt.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'Этот ключ уже использован для другого изменения.'); return; }
      let row = await AssessmentPairWork.findById(id).session(session).lean<AssessmentPairWorkType | null>();
      if ((row?.revision ?? 0) !== mutation.expectedRevision) fail('PAIR_WORK_STALE', 'Договорённость изменена. Обновите страницу.');
      if (mutation.action === 'propose' || mutation.action === 'revise') {
        const matching = await captureAssessmentComparisonScope(ownerId, 'MATCHING', session);
        const shared = await captureAssessmentComparisonScope(ownerId, 'PAIR_MODEL', session);
        if (!matching || !shared || matching.pairId !== scope.pairId || shared.pairId !== scope.pairId) fail('PLAN_UNAVAILABLE', 'План сейчас недоступен.');
        const comparison = await AssessmentComparison.findOne({ ownerId, pairId: scope.pairId }).session(session).lean();
        const storedEnvelope = assessmentEnvelopeSchema.safeParse(comparison?.envelope);
        const storedCurrent = AssessmentCurrentComparisonSchema.safeParse(comparison?.current);
        if (!comparison || !storedEnvelope.success || !storedCurrent.success || storedCurrent.data.revision !== comparison.revision || !assessmentProjectionMatchesEnvelope(storedCurrent.data, storedEnvelope.data) || !isAssessmentEnvelopeCurrent(storedEnvelope.data, assessmentEnvelopeForScope(matching, ownerId, { actionIds: [], limits: storedEnvelope.data.searchLimits, completeness: storedEnvelope.data.completeness }))) fail('PLAN_STALE', 'Пересчитайте текущие условия перед предложением.');
        let assumptions: string[] = [];
        if (mutation.scenarioId) {
          const selected = Array.isArray(comparison.scenarios) ? comparison.scenarios.find(scenario => {
            const dto = AssessmentConditionalScenarioSchema.safeParse(scenario?.dto);
            return dto.success && dto.data.id === mutation.scenarioId;
          }) : undefined;
          const selectedEnvelope = assessmentEnvelopeSchema.safeParse(selected?.envelope);
          const selectedDTO = AssessmentConditionalScenarioSchema.safeParse(selected?.dto);
          if (!selectedEnvelope.success || !selectedDTO.success || selectedDTO.data.baseRevision !== comparison.revision || !assessmentProjectionMatchesEnvelope(selectedDTO.data, selectedEnvelope.data) || selectedDTO.data.status !== 'TARGET_SUPPORTED' || selectedDTO.data.completeness !== 'COMPLETE_WITHIN_LIMITS'
            || !isAssessmentEnvelopeCurrent(selectedEnvelope.data, assessmentEnvelopeForScope(matching, ownerId, { actionIds: selectedEnvelope.data.selectedPublishedActionIds, searchActionIds: selectedEnvelope.data.searchActionCatalogIds, limits: selectedEnvelope.data.searchLimits, completeness: selectedEnvelope.data.completeness }))) fail('PLAN_UNAVAILABLE', 'Условный вариант устарел или не поддержан.');
          assumptions = selectedDTO.data.assumptions;
        } else if (storedCurrent.data.status !== 'TARGET_SUPPORTED' || storedCurrent.data.completeness !== 'COMPLETE_WITHIN_LIMITS') fail('PLAN_UNAVAILABLE', 'Сначала нужен поддержанный текущий или условный вариант.');
        const contentRevision = (row?.contentRevision ?? 0) + 1;
        row = { _id: id, pairId: scope.pairId, actorIds: scope.actors, revision: (row?.revision ?? 0) + 1, contentRevision,
          contentHash: assessmentIdentity(content, JSON.stringify(assumptions), String(contentRevision)), content, assumptions,
          dependencyHash: scope.dependencyHash, basisEnvelope: storedEnvelope.data, activeAt: null, confirmations: [], revoked: false, proposedAt: (hooks.now ?? new Date()).toISOString() };
      } else {
        if (!row) fail('PLAN_UNAVAILABLE', 'Договорённость ещё не предложена.');
        if (!control && row.dependencyHash !== scope.dependencyHash) fail('PAIR_CONTEXT_STALE', 'Разрешение изменилось. Предложите новую редакцию.');
        if (mutation.action === 'revoke') { row.revoked = true; row.confirmations = []; }
        else if (mutation.action === 'confirm') {
          if (row.revoked || row.contentRevision !== mutation.expectedContentRevision) fail('AGREEMENT_VERSION_STALE', 'Подтверждается другая редакция договора.');
          if (agreementStatus(asAgreement(row, scope), scope.pairId) !== 'ACTIVE') {
            const basis = assessmentEnvelopeSchema.safeParse(row.basisEnvelope);
            if (!basis.success || !scope.actors.includes(basis.data.viewerId)) fail('PLAN_STALE', 'Основание договора недоступно. Предложите новую редакцию.');
            const current = await captureAssessmentComparisonScope(basis.data.viewerId, 'MATCHING', session);
            if (!current || current.pairId !== scope.pairId || !isAssessmentEnvelopeCurrent(basis.data, assessmentEnvelopeForScope(current, basis.data.viewerId, { actionIds: [], limits: basis.data.searchLimits, completeness: basis.data.completeness }))) fail('PLAN_STALE', 'Исходные ответы изменились. Пересчитайте план и предложите новую редакцию.');
          }
          row.confirmations = row.confirmations.filter(value => value.ownerId !== ownerId);
          row.confirmations.push({ ownerId, contentRevision: row.contentRevision, contentHash: row.contentHash });
          if (agreementStatus(asAgreement(row, scope), scope.pairId) === 'ACTIVE' && !row.activeAt) row.activeAt = (hooks.now ?? new Date()).toISOString();
        } else if (mutation.action === 'observe') {
          if (agreementStatus(asAgreement(row, scope), scope.pairId) !== 'ACTIVE') fail('AGREEMENT_NOT_ACTIVE', 'Нужны два независимых подтверждения.');
          await beginAssessmentFollowup(ownerId, session, hooks.now ?? new Date());
        } else if (mutation.action === 'revoke-report') {
          await AssessmentPairReport.updateOne({ ownerId, pairId: scope.pairId, periodId: mutation.periodId, contentRevision: row.contentRevision }, { $set: { shared: false }, $inc: { revision: 1 } }, { session });
        } else {
          if (agreementStatus(asAgreement(row, scope), scope.pairId) !== 'ACTIVE') fail('AGREEMENT_NOT_ACTIVE', 'Нужны два независимых подтверждения.');
          const period = periods(row, hooks.now ?? new Date()).find(value => value.id === mutation.periodId);
          if (!period) fail('REPORT_PERIOD_UNAVAILABLE', 'Этот период отчёта недоступен.', 400);
          await AssessmentPairReport.updateOne({ _id: assessmentIdentity('assessment-pair-report-v1', scope.pairId, ownerId, String(row.contentRevision), period.id) }, { $set: {
            ownerId, pairId: scope.pairId, contentRevision: row.contentRevision, periodId: period.id, window: period.window,
            value: mutation.category, shared: mutation.shared, recordedAt: (hooks.now ?? new Date()).toISOString(),
          }, $inc: { revision: 1 } }, { upsert: true, session });
        }
        row.revision++;
      }
      const { _id, ...values } = row;
      await AssessmentPairWork.updateOne({ _id }, { $set: values }, { upsert: true, session });
      await AssessmentOperation.create([{ _id: operationId, ownerId, requestHash, committedRevision: row.revision }], { session });
    });
    return readPair(ownerId, hooks.now ?? new Date(), control, mutation.context.pairId);
  },
};
