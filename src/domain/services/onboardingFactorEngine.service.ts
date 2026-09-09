import { createHash } from 'node:crypto';
import type { FactorDefinition } from '@/domain/model/definitions/definitionTypes';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  createEvidenceEvent,
  type EvidenceCaptureMode,
  type EvidenceEvent as DomainEvidenceEvent,
  type EvidencePurpose,
} from '@/domain/model/evidence/evidence';
import {
  buildIndividualFactorSnapshot,
  isSnapshotEffectiveAt,
  snapshotVersionsMatchRegistry,
} from '@/domain/model/snapshots/snapshots';
import type { FactorValue } from '@/domain/model/values/factorValue';
import {
  FactorPersistenceConflictError,
  materializeIndividualFactorSnapshot,
  seedDefinitionRegistryRelease,
  upsertEvidenceEvent,
} from '@/domain/services/factorEnginePersistence.service';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import type {
  MvpOnboardingAnswer,
  MvpOnboardingCapturePolicy,
  MvpOnboardingSessionType,
} from '@/models/MvpOnboardingSession';

const MATERIALIZATION_RETRY_LIMIT = 5;

type OnboardingFactorBinding = {
  questionId:
    | 'repair_confidence'
    | 'planning_style'
    | 'children_intent';
  factorKey:
    | 'communication.conflict.repairSkill'
    | 'sharedLife.planning.structurePreference'
    | 'lifePlans.family.childrenIntent';
  measurementKey:
    | 'onboarding.repairSkill.selfReport'
    | 'onboarding.structurePreference.direct'
    | 'onboarding.childrenIntent.direct';
};

const ONBOARDING_FACTOR_BINDINGS: readonly OnboardingFactorBinding[] = [
  {
    questionId: 'repair_confidence',
    factorKey: 'communication.conflict.repairSkill',
    measurementKey: 'onboarding.repairSkill.selfReport',
  },
  {
    questionId: 'planning_style',
    factorKey: 'sharedLife.planning.structurePreference',
    measurementKey: 'onboarding.structurePreference.direct',
  },
  {
    questionId: 'children_intent',
    factorKey: 'lifePlans.family.childrenIntent',
    measurementKey: 'onboarding.childrenIntent.direct',
  },
];

export type OnboardingFactorMaterializationResult = {
  registryVersion: number;
  evidenceEventIds: string[];
  individualSnapshotIds: string[];
};

export class OnboardingFactorEngineError extends Error {
  readonly reasonCode:
    | 'DEFINITION_MISSING'
    | 'ANSWER_INVALID'
    | 'EVIDENCE_REJECTED'
    | 'STORED_SNAPSHOT_INVALID'
    | 'MATERIALIZATION_RETRY_EXHAUSTED';

  constructor(reasonCode: OnboardingFactorEngineError['reasonCode']) {
    super(reasonCode);
    this.name = 'OnboardingFactorEngineError';
    this.reasonCode = reasonCode;
  }
}

const deterministicId = (prefix: string, parts: readonly string[]): string =>
  `${prefix}_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)}`;

const factorFor = (factorKey: OnboardingFactorBinding['factorKey']) => {
  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === factorKey
  );
  if (!factor) throw new OnboardingFactorEngineError('DEFINITION_MISSING');
  return factor;
};

const measurementFor = (measurementKey: OnboardingFactorBinding['measurementKey']) => {
  const measurement = MVP_FACTOR_REGISTRY.measurements.find(
    (candidate) => candidate.key === measurementKey
  );
  if (!measurement) throw new OnboardingFactorEngineError('DEFINITION_MISSING');
  return measurement;
};

const onboardingInstrument = () => {
  const instrument = MVP_FACTOR_REGISTRY.instruments.find(
    (candidate) => candidate.key === 'onboarding.mvp'
  );
  if (!instrument) throw new OnboardingFactorEngineError('DEFINITION_MISSING');
  return instrument;
};

const answerFor = (
  answers: readonly MvpOnboardingAnswer[],
  questionId: string
): MvpOnboardingAnswer | undefined =>
  answers.find((answer) => answer.questionId === questionId);

const masteryValue = (answer: MvpOnboardingAnswer): FactorValue => {
  if (answer.value.kind !== 'single') {
    throw new OnboardingFactorEngineError('ANSWER_INVALID');
  }
  switch (answer.value.optionId) {
    case 'need_guidance':
      return { kind: 'MASTERY', score01: 0.25, level: 'BASIC' };
    case 'sometimes_manage':
      return { kind: 'MASTERY', score01: 0.55, level: 'INTERMEDIATE' };
    case 'usually_manage':
      return { kind: 'MASTERY', score01: 0.85, level: 'ADVANCED' };
    default:
      throw new OnboardingFactorEngineError('ANSWER_INVALID');
  }
};

const structureValue = (answer: MvpOnboardingAnswer): FactorValue => {
  if (answer.value.kind !== 'single') {
    throw new OnboardingFactorEngineError('ANSWER_INVALID');
  }
  switch (answer.value.optionId) {
    case 'same_day':
      return { kind: 'SCALAR', value: -0.7 };
    case 'flexible_window':
      return { kind: 'SCALAR', value: 0 };
    case 'fixed_time':
      return { kind: 'SCALAR', value: 0.7 };
    default:
      throw new OnboardingFactorEngineError('ANSWER_INVALID');
  }
};

const childrenValue = (answer: MvpOnboardingAnswer | undefined): FactorValue => {
  if (!answer || answer.value.kind === 'skipped') {
    return { kind: 'UNKNOWN', reasonCode: 'NOT_ANSWERED' };
  }
  if (answer.value.kind !== 'single') {
    throw new OnboardingFactorEngineError('ANSWER_INVALID');
  }
  switch (answer.value.optionId) {
    case 'yes':
      return { kind: 'CONSTRAINT', value: 'YES' };
    case 'no':
      return { kind: 'CONSTRAINT', value: 'NO' };
    case 'unsure':
      return { kind: 'CONSTRAINT', value: 'UNSURE' };
    default:
      throw new OnboardingFactorEngineError('ANSWER_INVALID');
  }
};

const factorValueFor = (
  binding: OnboardingFactorBinding,
  answer: MvpOnboardingAnswer | undefined
): FactorValue => {
  if (binding.questionId === 'children_intent') return childrenValue(answer);
  if (!answer) throw new OnboardingFactorEngineError('ANSWER_INVALID');
  return binding.questionId === 'repair_confidence'
    ? masteryValue(answer)
    : structureValue(answer);
};

const capturePolicyFor = (input: {
  answer?: MvpOnboardingAnswer;
  factor: FactorDefinition;
}): {
  captureMode: EvidenceCaptureMode;
  purpose: EvidencePurpose;
} => {
  const capturePolicy: MvpOnboardingCapturePolicy =
    input.answer?.capturePolicy ?? 'PRIVATE';
  if (capturePolicy === 'PRIVATE') {
    return { captureMode: 'PRIVATE', purpose: 'OWNER_PROFILE' };
  }
  return {
    captureMode: capturePolicy,
    purpose:
      input.factor.privacyClass === 'MATCHING_ONLY' ? 'MATCHING' : 'PAIR_MODEL',
  };
};

const isRetryableMaterializationError = (error: Error): boolean => {
  if (
    error instanceof FactorPersistenceConflictError &&
    error.reasonCode === 'SNAPSHOT_REVISION_CONFLICT'
  ) {
    return true;
  }
  return (error as Error & { code?: number }).code === 11000;
};

const materializeSnapshot = async (input: {
  subjectId: string;
  factor: FactorDefinition;
  purpose: EvidencePurpose;
  event: DomainEvidenceEvent;
}): Promise<string> => {
  // A snapshot must never incorporate evidence that had not been recorded at
  // its evaluation cutoff. Onboarding answers can be observed before the
  // session is completed/recorded, so the source-of-truth cutoff is recordedAt.
  const calculatedAt = input.event.recordedAt;
  const provisional = buildIndividualFactorSnapshot({
    snapshotId: 'provisional',
    subjectId: input.subjectId,
    projectionPurpose: input.purpose,
    factor: input.factor,
    events: [input.event],
    revision: 0,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
    calculatedAt,
  });
  const snapshotId = deterministicId('ifs', [
    input.subjectId,
    input.purpose,
    input.factor.key,
    provisional.inputHash,
  ]);

  for (let attempt = 0; attempt < MATERIALIZATION_RETRY_LIMIT; attempt += 1) {
    const existing = await IndividualFactorSnapshot.findOne({
      subjectId: input.subjectId,
      contextPairId: { $exists: false },
      projectionPurpose: input.purpose,
      factorKey: input.factor.key,
      inputHash: provisional.inputHash,
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
      'versions.snapshotVersion': MVP_FACTOR_REGISTRY.snapshotVersion,
    }).select({
      snapshotId: 1,
      versions: 1,
      calculatedAt: 1,
      effectiveFrom: 1,
      effectiveUntil: 1,
    });
    if (existing) {
      if (
        !snapshotVersionsMatchRegistry(
          existing.versions,
          input.factor,
          MVP_FACTOR_REGISTRY
        ) ||
        !isSnapshotEffectiveAt(existing, calculatedAt)
      ) {
        throw new OnboardingFactorEngineError('STORED_SNAPSHOT_INVALID');
      }
      return existing.snapshotId;
    }

    const latest = await IndividualFactorSnapshot.findOne({
      subjectId: input.subjectId,
      contextPairId: { $exists: false },
      projectionPurpose: input.purpose,
      factorKey: input.factor.key,
    })
      .sort({ revision: -1 })
      .select({ revision: 1 });
    const revision = (latest?.revision ?? -1) + 1;
    try {
      const snapshot = await materializeIndividualFactorSnapshot(
        {
          snapshotId,
          subjectId: input.subjectId,
          projectionPurpose: input.purpose,
          factor: input.factor,
          events: [input.event],
          revision,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
          snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
          displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
          calculatedAt,
        },
        MVP_FACTOR_REGISTRY
      );
      return snapshot.snapshotId;
    } catch (error) {
      if (!(error instanceof Error) || !isRetryableMaterializationError(error)) {
        throw error;
      }
    }
  }
  throw new OnboardingFactorEngineError('MATERIALIZATION_RETRY_EXHAUSTED');
};

export async function materializeOnboardingFactorEvidence(input: {
  sessionId: string;
  subjectId: string;
  session: Pick<
    MvpOnboardingSessionType,
    'answers' | 'policyVersion' | 'consent' | 'completedAt'
  >;
}): Promise<OnboardingFactorMaterializationResult> {
  await seedDefinitionRegistryRelease(
    MVP_FACTOR_REGISTRY,
    input.session.completedAt ?? input.session.consent.confirmedAt
  );
  const instrument = onboardingInstrument();
  const evidenceEventIds: string[] = [];
  const individualSnapshotIds: string[] = [];

  for (const binding of ONBOARDING_FACTOR_BINDINGS) {
    const factor = factorFor(binding.factorKey);
    const measurement = measurementFor(binding.measurementKey);
    const answer = answerFor(input.session.answers, binding.questionId);
    const value = factorValueFor(binding, answer);
    const capture = capturePolicyFor({ answer, factor });
    const sourceRevision = answer
      ? `${answer.questionRevision}:answer-${answer.answerRevision}`
      : 'not-answered-v1';
    const observedAt =
      answer?.answeredAt ??
      input.session.completedAt ??
      input.session.consent.confirmedAt;
    const identity = [
      MVP_FACTOR_REGISTRY.registryKey,
      String(MVP_FACTOR_REGISTRY.registryVersion),
      input.subjectId,
      input.sessionId,
      binding.factorKey,
      binding.measurementKey,
      sourceRevision,
    ];
    const event = createEvidenceEvent(
      {
        eventId: deterministicId('fev', identity),
        idempotencyKey: deterministicId('onboarding', identity),
        actorId: input.subjectId,
        subjectKind: 'INDIVIDUAL',
        subjectId: input.subjectId,
        observationScope: 'SELF',
        factorKey: factor.key,
        measurementKey: measurement.key,
        instrumentKey: instrument.key,
        sourceType: measurement.sourceType,
        sourceRef: `mvp-onboarding:${input.sessionId}:${binding.questionId}`,
        sourceRevision,
        submittedValue: value,
        reliabilityMultiplier: 1,
        observedAt,
        recordedAt: input.session.completedAt ?? observedAt,
        context: 'SELF',
        purpose: capture.purpose,
        privacyClass: factor.privacyClass,
        captureMode: capture.captureMode,
        policyVersion: input.session.policyVersion,
        consentRevision: `consent:${input.session.consent.confirmedAt.toISOString()}`,
        retentionClass: 'OWNER_CONTROLLED',
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      },
      factor,
      measurement,
      instrument
    );
    await upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY);
    evidenceEventIds.push(event.eventId);
    if (event.status === 'REJECTED') {
      throw new OnboardingFactorEngineError('EVIDENCE_REJECTED');
    }
    individualSnapshotIds.push(
      await materializeSnapshot({
        subjectId: input.subjectId,
        factor,
        purpose: capture.purpose,
        event,
      })
    );
    if (capture.purpose !== 'OWNER_PROFILE') {
      individualSnapshotIds.push(await materializeSnapshot({ subjectId: input.subjectId, factor, purpose: 'OWNER_PROFILE', event }));
    }
  }

  return {
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    evidenceEventIds: evidenceEventIds.sort(),
    individualSnapshotIds: individualSnapshotIds.sort(),
  };
}
