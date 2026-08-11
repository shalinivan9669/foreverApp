import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MVP_FACTOR_REGISTRY, createEvidenceEvent } from '@/domain/model';
import {
  materializeLatestWeeklyIndividualFactorSnapshots,
  materializeWeeklyPairFactorEvaluationSnapshots,
  processWeeklyFactorCheckIn,
  readLatestInternalWeeklyPairEvaluations,
} from '@/domain/services/factorEngineRuntime.service';
import {
  FactorPersistenceConflictError,
  seedDefinitionRegistryRelease,
  upsertEvidenceEvent,
} from '@/domain/services/factorEnginePersistence.service';
import { materializeCurrentOwnerFactorSnapshots } from '@/domain/services/activityFactorRuntime.service';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import { toStoredFactorValue } from '@/models/factorEngineSchemas';

const mongodbUri =
  process.env.FACTOR_ENGINE_TEST_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.trim() ||
  'mongodb://127.0.0.1:27018/foreverapp_factor_engine_test?directConnection=true';
const parsedUri = new URL(mongodbUri);
const databaseName = parsedUri.pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Factor Engine integration requires a database ending in _test');
}
if (parsedUri.searchParams.get('directConnection') !== 'true') {
  throw new Error('Factor Engine integration requires directConnection=true');
}

const runId = randomUUID();
const memberA = `factor-runtime-a-${runId}`;
const memberB = `factor-runtime-b-${runId}`;
const memberC = `factor-runtime-c-${runId}`;
const agingMember = `factor-runtime-aging-${runId}`;
const rejectedMember = `factor-runtime-rejected-${runId}`;
const nonWeeklyMember = `factor-runtime-nonweekly-${runId}`;
const pairOne = `factor-runtime-pair-one-${runId}`;
const pairTwo = `factor-runtime-pair-two-${runId}`;
const agingPair = `factor-runtime-aging-pair-${runId}`;
const rejectedPair = `factor-runtime-rejected-pair-${runId}`;
const observedAt = new Date('2026-08-11T12:00:00.000Z');
const observedAtDayTwo = new Date(observedAt.getTime() + 86_400_000);
const observedAtDayThree = new Date(observedAt.getTime() + 2 * 86_400_000);

const assertNoRawPartnerValues = (value: string): void => {
  assert.equal(value.includes('normalizedValue'), false);
  assert.equal(value.includes('submittedValue'), false);
  assert.equal(value.includes('scalarValue'), false);
  assert.equal(value.includes('"value"'), false);
};

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    directConnection: true,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    await Promise.all([
      DefinitionRegistryRelease.createIndexes(),
      EvidenceEvent.createIndexes(),
      IndividualFactorSnapshot.createIndexes(),
      PairFactorSnapshot.createIndexes(),
      PairFactorEvaluationSnapshot.createIndexes(),
    ]);

    const weeklyInstrument = MVP_FACTOR_REGISTRY.instruments.find(
      (instrument) => instrument.key === 'weekly.mvp'
    );
    assert.ok(weeklyInstrument);
    const onboardingInstrument = MVP_FACTOR_REGISTRY.instruments.find(
      (instrument) => instrument.key === 'onboarding.mvp'
    );
    const repairFactor = MVP_FACTOR_REGISTRY.factors.find(
      (factor) => factor.key === 'communication.conflict.repairSkill'
    );
    const repairMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
      (measurement) =>
        measurement.key === 'onboarding.repairSkill.selfReport'
    );
    assert.ok(onboardingInstrument && repairFactor && repairMeasurement);
    await seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, observedAt);

    const nonWeeklyEvidence = [0.7, 0.7].map((score01, index) =>
      createEvidenceEvent(
        {
          eventId: `nonweekly-${index}-${runId}`,
          idempotencyKey: `nonweekly-${index}-${runId}`,
          actorId: nonWeeklyMember,
          subjectKind: 'INDIVIDUAL',
          subjectId: nonWeeklyMember,
          observationScope: 'SELF',
          factorKey: repairFactor.key,
          measurementKey: repairMeasurement.key,
          instrumentKey: onboardingInstrument.key,
          sourceType: repairMeasurement.sourceType,
          sourceRef: `nonweekly-source-${index}-${runId}`,
          sourceRevision: 'nonweekly-source-v1',
          submittedValue: {
            kind: 'MASTERY',
            score01,
            level: 'INTERMEDIATE',
          },
          reliabilityMultiplier: 1,
          observedAt: new Date(observedAt.getTime() - index * 60_000),
          recordedAt: observedAt,
          context: 'SELF',
          purpose: 'OWNER_PROFILE',
          privacyClass: repairFactor.privacyClass,
          captureMode: 'PRIVATE',
          policyVersion: 'mvp-privacy-v1',
          consentRevision: 'nonweekly-consent-v1',
          retentionClass: 'OWNER_CONTROLLED',
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
        },
        repairFactor,
        repairMeasurement,
        onboardingInstrument
      )
    );
    await Promise.all(
      nonWeeklyEvidence.map((event) =>
        upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY)
      )
    );
    const nonWeeklyInitial = await materializeCurrentOwnerFactorSnapshots({
      subjectId: nonWeeklyMember,
      factorKeys: [repairFactor.key],
      calculatedAt: observedAt,
    });
    assert.equal(nonWeeklyInitial.length, 1, 'nonweekly initial length');
    assert.equal(nonWeeklyInitial[0]?.revision, 0, 'nonweekly initial revision');
    assert.equal(nonWeeklyInitial[0]?.status, 'AVAILABLE', 'nonweekly initial status');
    const nonWeeklyNextDay = await materializeCurrentOwnerFactorSnapshots({
      subjectId: nonWeeklyMember,
      factorKeys: [repairFactor.key],
      calculatedAt: new Date(observedAt.getTime() + 29 * 60 * 60 * 1000),
    });
    assert.equal(nonWeeklyNextDay.length, 1, 'nonweekly next-day length');
    assert.equal(nonWeeklyNextDay[0]?.revision, 1, 'nonweekly next-day revision');
    assert.equal(nonWeeklyNextDay[0]?.status, 'AVAILABLE', 'nonweekly next-day status');
    const nonWeeklyNextDayRetry =
      await materializeCurrentOwnerFactorSnapshots({
        subjectId: nonWeeklyMember,
        factorKeys: [repairFactor.key],
        calculatedAt: new Date(observedAt.getTime() + 30 * 60 * 60 * 1000),
      });
    assert.deepEqual(nonWeeklyNextDayRetry, nonWeeklyNextDay);
    const rejectedEvents = [
      ['communication.weekly.connection', 'weekly.connection.direct'],
      ['communication.weekly.tension', 'weekly.tension.direct'],
      ['wellbeing.current.overload', 'weekly.overload.direct'],
      ['wellbeing.current.readiness', 'weekly.readiness.direct'],
    ].map(([factorKey, measurementKey]) => {
      const factor = MVP_FACTOR_REGISTRY.factors.find(
        (candidate) => candidate.key === factorKey
      );
      const measurement = MVP_FACTOR_REGISTRY.measurements.find(
        (candidate) => candidate.key === measurementKey
      );
      assert.ok(factor && measurement);
      return createEvidenceEvent(
        {
          eventId: `rejected-${factorKey}-${runId}`,
          idempotencyKey: `rejected-${factorKey}-${runId}`,
          actorId: rejectedMember,
          subjectKind: 'INDIVIDUAL',
          subjectId: rejectedMember,
          pairId: rejectedPair,
          observationScope: 'SELF',
          factorKey,
          measurementKey,
          instrumentKey: weeklyInstrument.key,
          sourceType: 'CHECK_IN',
          sourceRef: `weekly-check-in:rejected-${runId}`,
          sourceRevision: 'weekly-check-in-answer-v1',
          submittedValue: { kind: 'SCALAR', value: 2 },
          reliabilityMultiplier: 1,
          observedAt,
          recordedAt: observedAt,
          context: 'COMMITTED_RELATIONSHIP',
          purpose: 'PAIR_MODEL',
          privacyClass: factor.privacyClass,
          captureMode: 'PAIR_MODEL_ONLY',
          policyVersion: 'mvp-privacy-v1',
          consentRevision: 'weekly-check-in-consent-v1',
          retentionClass: 'PAIR_CONTEXT',
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
        },
        factor,
        measurement,
        weeklyInstrument
      );
    });
    assert.ok(rejectedEvents.every((event) => event.status === 'REJECTED'));
    assert.ok(
      rejectedEvents.every((event) => !('normalizedValue' in event)),
      'rejected domain evidence must not expose a normalized value'
    );
    const rejectedWrites = await Promise.all(
      rejectedEvents.map((event) =>
        upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY)
      )
    );
    const firstRejected = rejectedEvents[0];
    const firstRejectedWrite = rejectedWrites[0];
    assert.ok(firstRejected && firstRejectedWrite);
    assert.deepEqual(
      await upsertEvidenceEvent(firstRejected, MVP_FACTOR_REGISTRY),
      firstRejectedWrite
    );
    assert.equal(
      await EvidenceEvent.countDocuments({
        subjectId: rejectedMember,
        pairId: rejectedPair,
      }),
      rejectedEvents.length
    );
    const storedRejected = await EvidenceEvent.findOne({
      eventId: firstRejected.eventId,
    }).lean();
    assert.ok(storedRejected);
    assert.equal(
      Object.prototype.hasOwnProperty.call(storedRejected, 'normalizedValue'),
      false
    );
    const invalidRejectedDocument = new EvidenceEvent({
      ...storedRejected,
      normalizedValue: toStoredFactorValue(firstRejected.submittedValue),
    });
    assert.match(
      invalidRejectedDocument.validateSync()?.message ?? '',
      /Evidence rejection fields do not match status/
    );
    await assert.rejects(
      invalidRejectedDocument.validate(),
      /Evidence rejection fields do not match status/
    );

    const conflictFactor = MVP_FACTOR_REGISTRY.factors.find(
      (candidate) => candidate.key === firstRejected.factorKey
    );
    const conflictMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
      (candidate) => candidate.key === firstRejected.measurementKey
    );
    assert.ok(conflictFactor && conflictMeasurement);
    const conflictingRejected = createEvidenceEvent(
      {
        eventId: firstRejected.eventId,
        idempotencyKey: firstRejected.idempotencyKey,
        actorId: rejectedMember,
        subjectKind: 'INDIVIDUAL',
        subjectId: rejectedMember,
        pairId: rejectedPair,
        observationScope: 'SELF',
        factorKey: conflictFactor.key,
        measurementKey: conflictMeasurement.key,
        instrumentKey: weeklyInstrument.key,
        sourceType: 'CHECK_IN',
        sourceRef: `weekly-check-in:rejected-conflict-${runId}`,
        sourceRevision: 'weekly-check-in-answer-v1',
        submittedValue: { kind: 'SCALAR', value: 2 },
        reliabilityMultiplier: 1,
        observedAt,
        recordedAt: observedAt,
        context: 'COMMITTED_RELATIONSHIP',
        purpose: 'PAIR_MODEL',
        privacyClass: conflictFactor.privacyClass,
        captureMode: 'PAIR_MODEL_ONLY',
        policyVersion: 'mvp-privacy-v1',
        consentRevision: 'weekly-check-in-consent-v1',
        retentionClass: 'PAIR_CONTEXT',
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      },
      conflictFactor,
      conflictMeasurement,
      weeklyInstrument
    );
    assert.equal(conflictingRejected.status, 'REJECTED');
    assert.notEqual(conflictingRejected.inputHash, firstRejected.inputHash);
    await assert.rejects(
      () => upsertEvidenceEvent(conflictingRejected, MVP_FACTOR_REGISTRY),
      (error: Error) =>
        error instanceof FactorPersistenceConflictError &&
        error.reasonCode === 'EVIDENCE_IDEMPOTENCY_CONFLICT'
    );
    assert.equal(
      await EvidenceEvent.countDocuments({
        subjectId: rejectedMember,
        pairId: rejectedPair,
      }),
      rejectedEvents.length
    );
    assert.equal(
      (
        await EvidenceEvent.findOne({ eventId: firstRejected.eventId })
          .select({ inputHash: 1 })
          .lean()
      )?.inputHash,
      firstRejected.inputHash
    );
    const rejectedOnly =
      await materializeLatestWeeklyIndividualFactorSnapshots({
        subjectId: rejectedMember,
        pairId: rejectedPair,
        calculatedAt: observedAt,
      });
    assert.equal(rejectedOnly.length, 0);
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({
        subjectId: rejectedMember,
        contextPairId: rejectedPair,
      }),
      0
    );

    const validBesideRejected = await processWeeklyFactorCheckIn({
      pairId: rejectedPair,
      memberIds: [rejectedMember, memberC],
      actorId: rejectedMember,
      checkInId: `check-in-valid-${runId}`,
      closeness: 0.6,
      irritation: 0.3,
      fatigue: 0.4,
      readiness: 0.7,
      observedAt,
      recordedAt: observedAt,
    });
    assert.equal(validBesideRejected.individualSnapshots.length, 4);
    await EvidenceEvent.deleteMany({
      eventId: { $in: rejectedEvents.map((event) => event.eventId) },
    });
    const validWithoutRejected =
      await materializeLatestWeeklyIndividualFactorSnapshots({
        subjectId: rejectedMember,
        pairId: rejectedPair,
        calculatedAt: observedAt,
      });
    assert.deepEqual(validWithoutRejected, validBesideRejected.individualSnapshots);
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({
        subjectId: rejectedMember,
        contextPairId: rejectedPair,
      }),
      4
    );

    const agingInitial = await processWeeklyFactorCheckIn({
      pairId: agingPair,
      memberIds: [agingMember, memberC],
      actorId: agingMember,
      checkInId: `check-in-aging-${runId}`,
      closeness: 0.7,
      irritation: 0.25,
      fatigue: 0.45,
      readiness: 0.75,
      observedAt,
      recordedAt: observedAt,
    });
    const agingSameWindow =
      await materializeLatestWeeklyIndividualFactorSnapshots({
        subjectId: agingMember,
        pairId: agingPair,
        calculatedAt: new Date(observedAt.getTime() + 5 * 60 * 60 * 1000),
      });
    assert.deepEqual(agingSameWindow, agingInitial.individualSnapshots);
    const agingNextWindow =
      await materializeLatestWeeklyIndividualFactorSnapshots({
        subjectId: agingMember,
        pairId: agingPair,
        calculatedAt: new Date(
          observedAt.getTime() + 29 * 60 * 60 * 1000
        ),
      });
    assert.ok(agingNextWindow.every((item) => item.revision === 1));
    assert.ok(
      agingNextWindow.every((item, index) => {
        const initial = agingInitial.individualSnapshots[index];
        return (
          initial &&
          item.inputHash !== initial.inputHash &&
          item.outputHash !== initial.outputHash
        );
      })
    );
    const agingNextWindowRetry =
      await materializeLatestWeeklyIndividualFactorSnapshots({
        subjectId: agingMember,
        pairId: agingPair,
        calculatedAt: new Date(
          observedAt.getTime() + 30 * 60 * 60 * 1000
        ),
      });
    assert.deepEqual(agingNextWindowRetry, agingNextWindow);
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({
        subjectId: agingMember,
        contextPairId: agingPair,
      }),
      8
    );
    const latestAgedConnection = await IndividualFactorSnapshot.findOne({
      subjectId: agingMember,
      contextPairId: agingPair,
      factorKey: 'communication.weekly.connection',
    }).sort({ revision: -1 });
    assert.ok(latestAgedConnection);
    assert.ok(latestAgedConnection.metrics.freshness < 1);

    const firstA = await processWeeklyFactorCheckIn({
      pairId: pairOne,
      memberIds: [memberA, memberB],
      actorId: memberA,
      checkInId: `check-in-a1-${runId}`,
      closeness: 0.7,
      irritation: 0.25,
      fatigue: 0.45,
      readiness: 0.75,
      observedAt,
      recordedAt: observedAt,
    });
    assert.equal(firstA.evidence.length, 4);
    assert.equal(firstA.individualSnapshots.length, 4);
    assert.equal(firstA.pairEvaluations.length, 0);

    const retryA = await processWeeklyFactorCheckIn({
      pairId: pairOne,
      memberIds: [memberB, memberA],
      actorId: memberA,
      checkInId: `check-in-a1-${runId}`,
      closeness: 0.7,
      irritation: 0.25,
      fatigue: 0.45,
      readiness: 0.75,
      observedAt,
      recordedAt: observedAt,
    });
    assert.deepEqual(retryA.evidence, firstA.evidence);
    assert.deepEqual(retryA.individualSnapshots, firstA.individualSnapshots);
    assert.equal(
      await EvidenceEvent.countDocuments({ actorId: memberA, pairId: pairOne }),
      4
    );
    assert.equal(
      await IndividualFactorSnapshot.countDocuments({
        subjectId: memberA,
        contextPairId: pairOne,
      }),
      4
    );

    const connectionFactor = MVP_FACTOR_REGISTRY.factors.find(
      (factor) => factor.key === 'communication.weekly.connection'
    );
    const connectionMeasurement = MVP_FACTOR_REGISTRY.measurements.find(
      (measurement) => measurement.key === 'weekly.connection.direct'
    );
    assert.ok(connectionFactor && connectionMeasurement);
    const cutoffEvents = [
      {
        suffix: 'future-observed',
        observedAt: new Date(observedAt.getTime() + 2 * 60 * 60 * 1000),
        recordedAt: new Date(observedAt.getTime() + 2 * 60 * 60 * 1000),
      },
      {
        suffix: 'late-recorded',
        observedAt: new Date(observedAt.getTime() - 60 * 60 * 1000),
        recordedAt: new Date(observedAt.getTime() + 2 * 60 * 60 * 1000),
      },
    ].map((timing) =>
      createEvidenceEvent(
        {
          eventId: `${timing.suffix}-${runId}`,
          idempotencyKey: `${timing.suffix}-${runId}`,
          actorId: memberA,
          subjectKind: 'INDIVIDUAL',
          subjectId: memberA,
          pairId: pairOne,
          observationScope: 'SELF',
          factorKey: connectionFactor.key,
          measurementKey: connectionMeasurement.key,
          instrumentKey: weeklyInstrument.key,
          sourceType: connectionMeasurement.sourceType,
          sourceRef: `weekly-check-in:${timing.suffix}-${runId}`,
          sourceRevision: 'weekly-check-in-answer-v1',
          submittedValue: { kind: 'SCALAR', value: 0.99 },
          reliabilityMultiplier: 1,
          observedAt: timing.observedAt,
          recordedAt: timing.recordedAt,
          context: 'COMMITTED_RELATIONSHIP',
          purpose: 'PAIR_MODEL',
          privacyClass: connectionFactor.privacyClass,
          captureMode: 'PAIR_MODEL_ONLY',
          policyVersion: 'mvp-privacy-v1',
          consentRevision: 'weekly-check-in-consent-v1',
          retentionClass: 'PAIR_CONTEXT',
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
        },
        connectionFactor,
        connectionMeasurement,
        weeklyInstrument
      )
    );
    assert.ok(cutoffEvents.every((event) => event.status === 'ACCEPTED'));
    await Promise.all(
      cutoffEvents.map((event) => upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY))
    );
    const boundedAtCutoff =
      await materializeLatestWeeklyIndividualFactorSnapshots({
        subjectId: memberA,
        pairId: pairOne,
        calculatedAt: observedAt,
      });
    assert.deepEqual(boundedAtCutoff, firstA.individualSnapshots);

    const firstB = await processWeeklyFactorCheckIn({
      pairId: pairOne,
      memberIds: [memberA, memberB],
      actorId: memberB,
      checkInId: `check-in-b1-${runId}`,
      closeness: 0.65,
      irritation: 0.3,
      fatigue: 0.35,
      readiness: 0.7,
      observedAt,
      recordedAt: observedAt,
    });
    assert.equal(firstB.pairEvaluations.length, 4);
    assert.ok(firstB.pairEvaluations.every((item) => item.revision === 0));

    const retryB = await processWeeklyFactorCheckIn({
      pairId: pairOne,
      memberIds: [memberB, memberA],
      actorId: memberB,
      checkInId: `check-in-b1-${runId}`,
      closeness: 0.65,
      irritation: 0.3,
      fatigue: 0.35,
      readiness: 0.7,
      observedAt,
      recordedAt: observedAt,
    });
    assert.deepEqual(retryB.pairEvaluations, firstB.pairEvaluations);
    assert.equal(
      await PairFactorEvaluationSnapshot.countDocuments({ pairId: pairOne }),
      4
    );

    const safeRead = await readLatestInternalWeeklyPairEvaluations({
      pairId: pairOne,
      effectiveAt: observedAt,
    });
    assert.equal(safeRead.evaluations.length, 4);
    assertNoRawPartnerValues(JSON.stringify(safeRead));

    const nextWindowAt = new Date(observedAt.getTime() + 29 * 60 * 60 * 1000);
    const nextWindowEvaluations =
      await materializeWeeklyPairFactorEvaluationSnapshots({
        pairId: pairOne,
        memberIds: [memberA, memberB],
        calculatedAt: nextWindowAt,
      });
    assert.ok(nextWindowEvaluations.every((item) => item.revision === 1));
    const nextWindowRead = await readLatestInternalWeeklyPairEvaluations({
      pairId: pairOne,
      effectiveAt: nextWindowAt,
    });
    assert.equal(nextWindowRead.evaluations.length, 4);
    assert.ok(
      nextWindowRead.evaluations.every((item) =>
        nextWindowEvaluations.some(
          (materialized) => materialized.snapshotId === item.snapshotId
        )
      )
    );

    const secondA = await processWeeklyFactorCheckIn({
      pairId: pairOne,
      memberIds: [memberA, memberB],
      actorId: memberA,
      checkInId: `check-in-a2-${runId}`,
      closeness: 0.55,
      irritation: 0.4,
      fatigue: 0.6,
      readiness: 0.5,
      observedAt: observedAtDayTwo,
      recordedAt: observedAtDayTwo,
    });
    assert.ok(secondA.individualSnapshots.every((item) => item.revision === 2));
    assert.ok(secondA.pairEvaluations.every((item) => item.revision === 2));

    const pairTwoA = await processWeeklyFactorCheckIn({
      pairId: pairTwo,
      memberIds: [memberA, memberC],
      actorId: memberA,
      checkInId: `check-in-a-pair-two-${runId}`,
      closeness: 0.9,
      irritation: 0.1,
      fatigue: 0.2,
      readiness: 0.9,
      observedAt: observedAtDayThree,
      recordedAt: observedAtDayThree,
    });
    assert.equal(pairTwoA.pairEvaluations.length, 0);
    assert.ok(
      pairTwoA.individualSnapshots.every(
        (item) =>
          item.contextPairId === pairTwo &&
          item.revision === 0 &&
          item.evidenceCount === 1
      )
    );

    const pairTwoC = await processWeeklyFactorCheckIn({
      pairId: pairTwo,
      memberIds: [memberC, memberA],
      actorId: memberC,
      checkInId: `check-in-c-pair-two-${runId}`,
      closeness: 0.8,
      irritation: 0.2,
      fatigue: 0.25,
      readiness: 0.8,
      observedAt: observedAtDayThree,
      recordedAt: observedAtDayThree,
    });
    assert.equal(pairTwoC.pairEvaluations.length, 4);
    assert.ok(pairTwoC.pairEvaluations.every((item) => item.revision === 0));

    const pairOneAfterReconnect =
      await readLatestInternalWeeklyPairEvaluations({
        pairId: pairOne,
        effectiveAt: observedAtDayTwo,
      });
    const pairTwoAfterReconnect =
      await readLatestInternalWeeklyPairEvaluations({
        pairId: pairTwo,
        effectiveAt: observedAtDayThree,
      });
    assert.ok(
      pairOneAfterReconnect.evaluations.every((item) => item.revision === 2)
    );
    assert.ok(
      pairTwoAfterReconnect.evaluations.every((item) => item.revision === 0)
    );
    assert.equal(
      pairOneAfterReconnect.evaluations.some((first) =>
        pairTwoAfterReconnect.evaluations.some(
          (second) => first.snapshotId === second.snapshotId
        )
      ),
      false
    );

    const expiredAt = new Date(observedAt.getTime() + 31 * 86_400_000);
    await materializeWeeklyPairFactorEvaluationSnapshots({
      pairId: pairOne,
      memberIds: [memberA, memberB],
      calculatedAt: expiredAt,
    });
    const expiredRead = await readLatestInternalWeeklyPairEvaluations({
      pairId: pairOne,
      effectiveAt: expiredAt,
    });
    assert.equal(
      expiredRead.evaluations.length,
      0,
      'expired newest evaluations must fail closed without older fallback'
    );

    console.log('factor-engine runtime integration: ok');
  } finally {
    await Promise.all([
      EvidenceEvent.deleteMany({
        actorId: {
          $in: [
            memberA,
            memberB,
            memberC,
            agingMember,
            rejectedMember,
            nonWeeklyMember,
          ],
        },
      }),
      IndividualFactorSnapshot.deleteMany({
        subjectId: {
          $in: [
            memberA,
            memberB,
            memberC,
            agingMember,
            rejectedMember,
            nonWeeklyMember,
          ],
        },
      }),
      PairFactorEvaluationSnapshot.deleteMany({
        pairId: { $in: [pairOne, pairTwo, agingPair, rejectedPair] },
      }),
      PairFactorSnapshot.deleteMany({
        pairId: { $in: [pairOne, pairTwo, agingPair, rejectedPair] },
      }),
    ]);
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : 'integration failed'
  );
  process.exitCode = 1;
});
