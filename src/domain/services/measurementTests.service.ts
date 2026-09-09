import { createHash } from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import { DomainError } from '@/domain/errors';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { MEASUREMENT_TESTS, measurementPublication } from '@/domain/model/measurements/catalog';
import { createEvidenceEvent, type EvidencePurpose } from '@/domain/model/evidence/evidence';
import { skillLevelForScore, type FactorValue } from '@/domain/model/values/factorValue';
import { seedDefinitionRegistryRelease, upsertEvidenceEvent } from './factorEnginePersistence.service';
import { materializeIndividual, toDomainEvidenceEvent } from './activityFactorRuntime.service';
import { refreshMeasuredMatchingProfile } from './matching/matchingProfileRuntime.service';
import { connectToDatabase } from '@/lib/mongodb';
import type { MeasurementMutation, MeasurementTestDTO } from '@/lib/dto/measurementTests.dto';
import { MeasurementTestSession, type MeasurementAnswer, type MeasurementTestSessionType } from '@/models/MeasurementTestSession';
import { EvidenceEvent, type EvidenceEventType } from '@/models/EvidenceEvent';
import { User } from '@/models/User';
import { refreshMeasuredPairsForOwner } from './measuredPairProfile.service';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';

const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const fail = (code: string, message: string, status = 409): never => { throw new DomainError({ code, message, status }); };
const sessionId = (ownerId: string, key: string) => identity('measurement-test-v1', ownerId, key);
const canonical = (answers: readonly MeasurementAnswer[]) => [...answers].sort((a, b) => a.questionId.localeCompare(b.questionId));

async function requireOwner(ownerId: string, session?: ClientSession) {
  const exists = await User.exists({ id: ownerId }).session(session ?? null);
  if (!exists) fail('NOT_FOUND', 'Аккаунт недоступен.', 404);
}

async function transaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { result = await operation(session); });
    return result;
  } finally { await session.endSession(); }
}

function publication(row: MeasurementTestSessionType) {
  const test = measurementPublication(row.testKey, row.contentRevision);
  if (!test || row.registryVersion !== MVP_FACTOR_REGISTRY.registryVersion) return fail('CONTENT_VERSION_UNAVAILABLE', 'Сохранённая редакция недоступна. Ответы закрыты и сохранены; требуется восстановление публикации.');
  return test;
}

function validate(row: MeasurementTestSessionType, answers: readonly MeasurementAnswer[], final: boolean): MeasurementAnswer[] {
  const test = publication(row);
  if (answers.length > test.questions.length || new Set(answers.map((answer) => answer.questionId)).size !== answers.length) fail('VALIDATION_ERROR', 'Проверьте вопросы и ответы.', 400);
  for (const answer of answers) {
    const question = test.questions.find((item) => item.id === answer.questionId);
    if (!question || (answer.choice !== null && (!Number.isInteger(answer.choice) || answer.choice < 1 || answer.choice > 3))) fail('VALIDATION_ERROR', 'Недопустимый вариант ответа.', 400);
  }
  if (final && test.questions.some((question) => !answers.some((answer) => answer.questionId === question.id && (!question.required || answer.choice !== null)))) fail('VALIDATION_ERROR', 'Ответьте на обязательные вопросы, а необязательные явно пропустите.', 400);
  return canonical(answers);
}

export async function recoverMeasurementResults(ownerId: string): Promise<void> {
  await requireOwner(ownerId);
  const pending = await MeasurementTestSession.find({ ownerId, status: 'FINALIZED', $expr: { $ne: ['$materializedRevision', '$permissionRevision'] } }).select({ _id: 1 }).limit(MEASUREMENT_TESTS.length).lean();
  for (const row of pending) await materializeMeasurement(ownerId, row._id);
}

async function materializeMeasurement(ownerId: string, id: string): Promise<void> {
  await transaction(async (session) => {
    // Owner fence serializes different tests, permission edits and matching writes.
    const fence = await User.updateOne({ id: ownerId }, { $inc: { pairMembershipRevision: 1 } }, { session });
    if (fence.matchedCount !== 1) fail('NOT_FOUND', 'Аккаунт недоступен.', 404);
    const row = await MeasurementTestSession.findOne({ _id: id, ownerId }).session(session).lean<MeasurementTestSessionType | null>();
    if (!row || row.status !== 'FINALIZED' || row.materializedRevision === row.permissionRevision) return;
    const test = publication(row);
    const at = row.finalizedAt!;
    await seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, at, { session });
    const instrument = MVP_FACTOR_REGISTRY.instruments.find((item) => item.key === 'profile.tests.v1')!;
    const factorKeys = new Set<string>();
    for (const question of test.questions) {
      const answer = row.answers.find((item) => item.questionId === question.id)!;
      const measurement = MVP_FACTOR_REGISTRY.measurements.find((item) => item.key === question.measurementKey)!;
      const factor = MVP_FACTOR_REGISTRY.factors.find((item) => item.key === measurement.factorKey)!;
      factorKeys.add(factor.key);
      const score = answer.choice === null ? null : [0.25, 0.55, 0.85][answer.choice - 1];
      const value: FactorValue = score === null ? { kind: 'UNKNOWN', reasonCode: 'NOT_ANSWERED' }
        : factor.valueSchema.type === 'MASTERY' ? { kind: 'MASTERY', score01: score, level: skillLevelForScore(score, factor.valueSchema) }
          : { kind: 'SCALAR', value: factor.valueSchema.type === 'SCALAR' && factor.valueSchema.min === -1 ? [-0.7, 0, 0.7][answer.choice! - 1] : [0.2, 0.5, 0.8][answer.choice! - 1] };
      const purposes: EvidencePurpose[] = [test.matching ? 'MATCHING' : 'OWNER_PROFILE', ...(row.pairUse ? ['PAIR_MODEL' as const] : [])];
      for (const purpose of purposes) {
        const token = identity(id, question.id, purpose, purpose === 'PAIR_MODEL' ? String(row.permissionRevision) : 'source');
        const event = createEvidenceEvent({ eventId: `fev_${token}`, idempotencyKey: `measurement_${token}`, actorId: ownerId, subjectKind: 'INDIVIDUAL', subjectId: ownerId, observationScope: 'SELF',
          factorKey: factor.key, measurementKey: measurement.key, instrumentKey: instrument.key, sourceType: measurement.sourceType,
          sourceRef: `measurement:${id}:${question.id}`, sourceRevision: `publication:${row.contentRevision}`, submittedValue: value, reliabilityMultiplier: 1,
          observedAt: at, recordedAt: purpose === 'PAIR_MODEL' ? row.updatedAt : at, context: 'SELF', purpose, privacyClass: factor.privacyClass, captureMode: purpose === 'OWNER_PROFILE' ? 'PRIVATE' : 'PAIR_MODEL_ONLY',
          policyVersion: 'profile-measurements-v1', consentRevision: purpose === 'PAIR_MODEL' ? `test:${id}:permission:${row.permissionRevision}` : `test:${id}`, retentionClass: 'OWNER_CONTROLLED', registryVersion: MVP_FACTOR_REGISTRY.registryVersion, algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion }, factor, measurement, instrument);
        if (event.status !== 'ACCEPTED') throw new Error(`MEASUREMENT_${event.rejectionCode}`);
        await upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY, { session });
      }
    }
    const now = new Date();
    for (const key of factorKeys) {
      const factor = MVP_FACTOR_REGISTRY.factors.find((item) => item.key === key)!;
      const events = await EvidenceEvent.find({ subjectId: ownerId, actorId: ownerId, observationScope: 'SELF', pairId: { $exists: false }, factorKey: key, status: 'ACCEPTED', captureMode: { $ne: 'SYSTEM_ONLY' }, 'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion }).sort({ observedAt: -1, eventId: -1 }).limit(64).session(session).lean<EvidenceEventType[]>();
      await materializeIndividual({ subjectId: ownerId, factor, projectionPurpose: 'OWNER_PROFILE', events: events.map(toDomainEvidenceEvent), fallbackCalculatedAt: now, session });
      if (factor.matchingPolicy?.enabled) await materializeIndividual({ subjectId: ownerId, factor, projectionPurpose: 'MATCHING', events: events.filter((event) => event.purpose === 'MATCHING').map(toDomainEvidenceEvent), fallbackCalculatedAt: now, session });
    }
    if (test.matching) await refreshMeasuredMatchingProfile(ownerId, session, now);
    await MeasurementTestSession.updateOne({ _id: id, permissionRevision: row.permissionRevision }, { $set: { materializedRevision: row.permissionRevision } }, { session });
  });
}

function dto(key: string, row: MeasurementTestSessionType | null): MeasurementTestDTO {
  const test = row ? publication(row) : measurementPublication(key);
  if (!test) return fail('NOT_FOUND', 'Анкета не найдена.', 404);
  return { test, status: row?.status ?? 'NEW', revision: row?.revision ?? 0, answers: row?.answers.map(({ questionId, choice }) => ({ questionId, choice })) ?? [], pairUse: row?.pairUse ?? false,
    permissionRevision: row?.permissionRevision ?? 0, calculation: !row || row.status === 'DRAFT' ? 'NOT_STARTED' : row.materializedRevision === row.permissionRevision ? 'READY' : 'PENDING', finalizedAt: row?.finalizedAt?.toISOString() ?? null,
    factorKeys: [...new Set(test.questions.map((question) => MVP_FACTOR_REGISTRY.measurements.find((item) => item.key === question.measurementKey)!.factorKey))] };
}

export const measurementTestsService = {
  async list(ownerId: string): Promise<MeasurementTestDTO[]> {
    await connectToDatabase(); await requireOwner(ownerId);
    const rows = await MeasurementTestSession.find({ ownerId }).limit(MEASUREMENT_TESTS.length).lean<MeasurementTestSessionType[]>();
    return MEASUREMENT_TESTS.map((test) => dto(test.key, rows.find((row) => row.testKey === test.key) ?? null));
  },
  async get(ownerId: string, key: string): Promise<MeasurementTestDTO> {
    await connectToDatabase(); await requireOwner(ownerId);
    const id = sessionId(ownerId, key);
    const startedAt = Date.now();
    try {
      await materializeMeasurement(ownerId, id);
      const completed = await MeasurementTestSession.exists({ _id: id, ownerId, status: 'FINALIZED' });
      if (completed) await refreshMeasuredPairsForOwner(ownerId);
    } catch (error) {
      if (error instanceof DomainError && ['NOT_FOUND', 'CONTENT_VERSION_UNAVAILABLE'].includes(error.code)) throw error;
      await requireOwner(ownerId);
      const pending = await MeasurementTestSession.findOne({ _id: id, ownerId, status: 'FINALIZED' }).lean<MeasurementTestSessionType | null>();
      if (!pending) throw error;
      recordOperationalEvent({ name: 'reconciliation_failed', routeGroup: 'other', outcome: 'error', durationMs: Date.now() - startedAt, code: 'MEASUREMENT_RESULT_PENDING' });
      return { ...dto(key, pending), calculation: 'PENDING' };
    }
    const row = await MeasurementTestSession.findOne({ _id: id, ownerId }).lean<MeasurementTestSessionType | null>();
    await requireOwner(ownerId);
    return dto(key, row);
  },
  async mutate(ownerId: string, key: string, mutation: MeasurementMutation, hooks: { afterSourceCommitted?: () => Promise<void> } = {}): Promise<MeasurementTestDTO> {
    await connectToDatabase(); await requireOwner(ownerId);
    const test = measurementPublication(key);
    if (!test) return fail('NOT_FOUND', 'Анкета не найдена.', 404);
    const id = sessionId(ownerId, key);
    await transaction(async (session) => {
      const fence = await User.updateOne({ id: ownerId }, { $inc: { pairMembershipRevision: 1 } }, { session });
      if (fence.matchedCount !== 1) fail('NOT_FOUND', 'Аккаунт недоступен.', 404);
      let row = await MeasurementTestSession.findOne({ _id: id, ownerId }).session(session).lean<MeasurementTestSessionType | null>();
      if (!row) {
        if (mutation.action !== 'start') return fail('TEST_NOT_STARTED', 'Сначала откройте анкету.');
        const created = await MeasurementTestSession.create([{ _id: id, ownerId, testKey: key, contentRevision: test.revision, registryVersion: MVP_FACTOR_REGISTRY.registryVersion }], { session });
        row = created[0].toObject();
      }
      if (mutation.action === 'start' || mutation.action === 'retry') return;
      if (mutation.action === 'permission') {
        if (row.permissionRevision !== mutation.expectedPermissionRevision) fail('PERMISSION_STALE', 'Разрешение изменилось в другой вкладке. Обновите страницу.');
        if (row.pairUse !== mutation.pairUse) await MeasurementTestSession.updateOne({ _id: id }, { $set: { pairUse: mutation.pairUse }, $inc: { permissionRevision: 1 } }, { session });
        return;
      }
      const answers = validate(row, mutation.answers, mutation.action === 'finalize');
      if (row.status === 'FINALIZED') {
        if (mutation.action !== 'finalize' || JSON.stringify(canonical(row.answers)) !== JSON.stringify(answers)) fail('TEST_ALREADY_COMPLETED', 'Анкета уже пройдена. Ответы закрыты; результат доступен для чтения.');
        return;
      }
      if (row.revision !== mutation.expectedRevision) fail('TEST_DRAFT_STALE', 'Черновик изменился в другой вкладке. Обновите страницу.');
      await MeasurementTestSession.updateOne({ _id: id, status: 'DRAFT', revision: row.revision }, { $set: { answers, pairUse: mutation.pairUse, ...(mutation.action === 'finalize' ? { status: 'FINALIZED', finalizedAt: new Date() } : {}) }, $inc: { revision: 1 } }, { session });
    });
    // The immutable source commits first. Retry/GET resumes an interrupted calculation.
    await hooks.afterSourceCommitted?.();
    return this.get(ownerId, key);
  },
};
