import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import mongoose, { Types } from 'mongoose';
import {
  FACTOR_EVIDENCE_SELECTION_MAXIMUM,
  factorEvidenceSelectionWindow,
} from '@/domain/model/aggregation/factorAggregation';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { WEEKLY_FACTOR_KEYS } from '@/domain/services/factorEngineRuntime.service';
import { pairHistoryService } from '@/domain/services/pairHistory.service';
import { notificationService } from '@/domain/services/notification.service';
import { buildPairDashboardSummary } from '@/domain/services/pairDashboardSummary.service';
import { weeklyCheckInService } from '@/domain/services/weeklyCheckIn.service';
import { weeklyCycleKeyForDate } from '@/domain/services/weeklyCycle.service';
import { recommendationWorkflowService } from '@/domain/services/recommendationWorkflow.service';
import { activitiesService } from '@/domain/services/activities.service';
import { SYSTEM_ACTIVITY_TEMPLATES } from '@/domain/services/pairActivityDecision.service';
import { resolveEntitlements } from '@/lib/entitlements/resolve';
import type { AuditRequestContext } from '@/lib/audit/eventTypes';
import { EventLog } from '@/models/EventLog';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import {
  PairFactorEvaluationSnapshot,
  type PairFactorEvaluationSnapshotType,
} from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import { Notification } from '@/models/Notification';
import { Pair } from '@/models/Pair';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { Subscription } from '@/models/Subscription';
import { User } from '@/models/User';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import { WeeklyCycle } from '@/models/WeeklyCycle';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');
const databaseName = decodeURIComponent(
  new URL(mongodbUri).pathname.replace(/^\//, '')
);
if (!databaseName.endsWith('_test')) {
  throw new Error('Load smoke requires a database name ending in _test');
}

const RUN_CONCURRENCY = 12;
const HISTORY_SAMPLES = 36;
const NOTIFICATION_SAMPLES = 36;
const ENTITLEMENT_SAMPLES = 36;
const NOTIFICATION_CREATE_SAMPLES = 24;
const DASHBOARD_SAMPLES = 24;
const RECOMMENDATION_SAMPLES = 12;
const ACTIVITY_COMPLETION_SAMPLES = 8;
const WEEKLY_SUBMISSION_SAMPLES = 2;
const CYCLE_COUNT = 180;
const ACTIVITY_COUNT = 360;
const FACTOR_HISTORY_DEPTH = 180;
const NOTIFICATIONS_PER_USER = 80;
const LEGACY_SUBSCRIPTIONS_PER_USER = 20;
const LOAD_NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;
const SYNTHETIC_HISTORY_OFFSET_MS = 30 * DAY_MS;
const PAGE_LIMIT = 20;
const P95_BUDGET_MS = {
  dashboardRead: 500,
  historyPagination: 500,
  repeatedRecommendation: 1_500,
} as const;

const userFixture = (id: string, username: string) => ({
  id,
  username,
  avatar: 'release-load-avatar',
  personal: {
    gender: 'female' as const,
    age: 30,
    city: 'Qyzylorda',
    relationshipStatus: 'in_relationship' as const,
  },
  preferences: {
    desiredAgeRange: { min: 18, max: 99 },
    maxDistanceKm: 50,
  },
  profile: {
    onboarding: {
      seeking: {
        valuedQualities: ['kindness', 'honesty', 'respect'],
        relationshipPriority: 'emotional_intimacy' as const,
        minExperience: 'none' as const,
        dealBreakers: 'none',
        firstDateSetting: 'cafe' as const,
        weeklyTimeCommitment: '5-10h' as const,
      },
    },
  },
});

type ScenarioStats = {
  samples: number;
  avgMs: number;
  p95Ms: number;
  errors: number;
  conflicts: number;
  errorCodes: Record<string, number>;
};

type TimedOutcome = {
  elapsedMs: number;
  outcome: 'ok' | 'error' | 'conflict';
  code?: string;
};

const roundMs = (value: number): number => Math.round(value * 100) / 100;

const isConflict = (error: unknown): boolean => {
  if (error instanceof Error && 'status' in error) {
    return (error as Error & { status?: number }).status === 409;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return (error as { code?: number }).code === 11000;
  }
  return false;
};

const safeErrorCode = (error: unknown): string => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'UNCLASSIFIED';
  }
  const value = String((error as { code?: string | number }).code ?? '');
  return /^[A-Z0-9_]{1,48}$/.test(value) ? value : 'UNCLASSIFIED';
};

const runConcurrentScenario = async (input: {
  samples: number;
  concurrency: number;
  operation: (sample: number) => Promise<void>;
}): Promise<ScenarioStats> => {
  const outcomes: TimedOutcome[] = new Array(input.samples);
  let nextSample = 0;
  const workers = Array.from(
    { length: Math.min(input.concurrency, input.samples) },
    async () => {
      while (true) {
        const sample = nextSample;
        nextSample += 1;
        if (sample >= input.samples) return;

        const startedAt = performance.now();
        try {
          await input.operation(sample);
          outcomes[sample] = {
            elapsedMs: performance.now() - startedAt,
            outcome: 'ok',
          };
        } catch (error) {
          outcomes[sample] = {
            elapsedMs: performance.now() - startedAt,
            outcome: isConflict(error) ? 'conflict' : 'error',
            code: safeErrorCode(error),
          };
        }
      }
    }
  );
  await Promise.all(workers);

  const durations = outcomes
    .map((outcome) => outcome.elapsedMs)
    .sort((left, right) => left - right);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
  const errorCodes = outcomes.reduce<Record<string, number>>((counts, outcome) => {
    if (!outcome.code) return counts;
    counts[outcome.code] = (counts[outcome.code] ?? 0) + 1;
    return counts;
  }, {});
  return {
    samples: input.samples,
    avgMs: roundMs(total / Math.max(1, durations.length)),
    p95Ms: roundMs(durations[p95Index] ?? 0),
    errors: outcomes.filter((outcome) => outcome.outcome === 'error').length,
    conflicts: outcomes.filter((outcome) => outcome.outcome === 'conflict')
      .length,
    errorCodes,
  };
};

type DeepFactorFixtureStats = {
  evidenceEvents: number;
  individualSnapshots: number;
  pairSnapshots: number;
  pairEvaluations: number;
};

const historicalWindowAt = (revision: number): Date => {
  const currentWindow = new Date(LOAD_NOW.getTime());
  currentWindow.setUTCHours(0, 0, 0, 0);
  return new Date(
    currentWindow.getTime() - (FACTOR_HISTORY_DEPTH - revision + 2) * DAY_MS
  );
};

const seedDeepFactorHistory = async (input: {
  runId: string;
  pairId: string;
  memberIds: readonly [string, string];
}): Promise<DeepFactorFixtureStats> => {
  const individualRows = await IndividualFactorSnapshot.find({
    subjectId: { $in: input.memberIds },
    contextPairId: input.pairId,
    projectionPurpose: 'PAIR_MODEL',
    factorKey: { $in: WEEKLY_FACTOR_KEYS },
  })
    .sort({ revision: -1 })
    .lean<(IndividualFactorSnapshotType & { _id: Types.ObjectId })[]>();
  const currentIndividuals = [
    ...new Map(
      individualRows.map((row) => [
        `${row.subjectId}|${row.factorKey}`,
        row,
      ])
    ).values(),
  ];
  assert.equal(
    currentIndividuals.length,
    WEEKLY_FACTOR_KEYS.length * input.memberIds.length,
    'weekly load did not produce every current individual Factor snapshot'
  );

  const evaluationRows = await PairFactorEvaluationSnapshot.find({
    pairId: input.pairId,
    factorKey: { $in: WEEKLY_FACTOR_KEYS },
  })
    .sort({ revision: -1 })
    .lean<(PairFactorEvaluationSnapshotType & { _id: Types.ObjectId })[]>();
  const currentEvaluations = [
    ...new Map(
      evaluationRows.map((row) => [
        `${row.factorKey}|${row.context}|${row.strategy}`,
        row,
      ])
    ).values(),
  ];
  assert.equal(
    currentEvaluations.length,
    WEEKLY_FACTOR_KEYS.length,
    'weekly load did not produce every current pair Factor evaluation'
  );

  await IndividualFactorSnapshot.collection.bulkWrite(
    currentIndividuals.map((row) => ({
      updateOne: {
        filter: { _id: row._id, revision: row.revision },
        update: { $set: { revision: row.revision + FACTOR_HISTORY_DEPTH } },
      },
    }))
  );
  await PairFactorEvaluationSnapshot.collection.bulkWrite(
    currentEvaluations.map((row) => ({
      updateOne: {
        filter: { _id: row._id, revision: row.revision },
        update: { $set: { revision: row.revision + FACTOR_HISTORY_DEPTH } },
      },
    }))
  );

  const individualHistory = currentIndividuals.flatMap((row) =>
    Array.from({ length: FACTOR_HISTORY_DEPTH }, (_, revision) => {
      const calculatedAt = historicalWindowAt(revision);
      return {
        snapshotId: `${input.runId}-ifs-${row.subjectId}-${row.factorKey}-${revision}`,
        subjectId: row.subjectId,
        contextPairId: row.contextPairId,
        projectionPurpose: row.projectionPurpose,
        factorKey: row.factorKey,
        revision,
        status: row.status,
        value: row.value,
        metrics: row.metrics,
        evidenceIds: row.evidenceIds,
        versions: {
          ...row.versions,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion - 1,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion - 1,
        },
        inputHash: `${input.runId}-ifs-input-${row.subjectId}-${row.factorKey}-${revision}`,
        outputHash: `${input.runId}-ifs-output-${row.subjectId}-${row.factorKey}-${revision}`,
        calculatedAt,
        effectiveFrom: calculatedAt,
        effectiveUntil: new Date(calculatedAt.getTime() + DAY_MS),
      };
    })
  );
  await IndividualFactorSnapshot.insertMany(individualHistory, { ordered: true });

  const evaluationHistory = currentEvaluations.flatMap((row) =>
    Array.from({ length: FACTOR_HISTORY_DEPTH }, (_, revision) => {
      const calculatedAt = historicalWindowAt(revision);
      return {
        snapshotId: `${input.runId}-pfe-${row.factorKey}-${revision}`,
        pairId: row.pairId,
        memberAId: row.memberAId,
        memberBId: row.memberBId,
        factorKey: row.factorKey,
        context: row.context,
        strategy: row.strategy,
        strategyVersion: row.strategyVersion,
        directionality: row.directionality,
        revision,
        evaluation: row.evaluation,
        individualSnapshotIds: row.individualSnapshotIds,
        pairSnapshotId: row.pairSnapshotId,
        versions: {
          ...row.versions,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion - 1,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion - 1,
        },
        inputHash: `${input.runId}-pfe-input-${row.factorKey}-${revision}`,
        outputHash: `${input.runId}-pfe-output-${row.factorKey}-${revision}`,
        calculatedAt,
        effectiveFrom: calculatedAt,
        effectiveUntil: new Date(calculatedAt.getTime() + DAY_MS),
      };
    })
  );
  await PairFactorEvaluationSnapshot.insertMany(evaluationHistory, {
    ordered: true,
  });

  const individualByFactor = new Map(
    currentIndividuals.map((row) => [row.factorKey, row] as const)
  );
  const pairHistory = WEEKLY_FACTOR_KEYS.flatMap((factorKey) => {
    const source = individualByFactor.get(factorKey);
    assert.ok(source, `missing source snapshot for ${factorKey}`);
    return Array.from({ length: FACTOR_HISTORY_DEPTH }, (_, revision) => {
      const calculatedAt = historicalWindowAt(revision);
      return {
        snapshotId: `${input.runId}-pfs-${factorKey}-${revision}`,
        pairId: input.pairId,
        factorKey,
        revision,
        status: source.status,
        value: source.value,
        metrics: source.metrics,
        evidenceIds: source.evidenceIds,
        versions: {
          ...source.versions,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion - 1,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion - 1,
        },
        inputHash: `${input.runId}-pfs-input-${factorKey}-${revision}`,
        outputHash: `${input.runId}-pfs-output-${factorKey}-${revision}`,
        calculatedAt,
        effectiveFrom: calculatedAt,
        effectiveUntil: new Date(calculatedAt.getTime() + DAY_MS),
      };
    });
  });
  await PairFactorSnapshot.insertMany(pairHistory, { ordered: true });

  const currentEvidence = await EvidenceEvent.collection
    .find({
      pairId: input.pairId,
      actorId: { $in: input.memberIds },
      factorKey: { $in: WEEKLY_FACTOR_KEYS },
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
    })
    .toArray();
  assert.equal(
    currentEvidence.length,
    WEEKLY_FACTOR_KEYS.length * input.memberIds.length,
    'weekly load did not produce every current Factor evidence event'
  );
  const evidenceHistory = currentEvidence.flatMap((row) =>
    Array.from({ length: FACTOR_HISTORY_DEPTH }, (_, revision) => {
      const { _id: ignoredId, ...artifact } = row;
      void ignoredId;
      const observedAt = historicalWindowAt(revision);
      return {
        ...artifact,
        eventId: `${input.runId}-fev-${row.factorKey}-${row.actorId}-${revision}`,
        idempotencyKey: `${input.runId}-fev-idem-${row.factorKey}-${row.actorId}-${revision}`,
        sourceRef: `${input.runId}:deep-factor:${revision}`,
        sourceRevision: `deep-factor-${revision}`,
        observedAt,
        recordedAt: observedAt,
        versions: {
          ...row.versions,
          registryVersion: MVP_FACTOR_REGISTRY.registryVersion - 1,
          algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion - 1,
        },
        inputHash: `${input.runId}-fev-input-${row.factorKey}-${row.actorId}-${revision}`,
      };
    })
  );
  await EvidenceEvent.collection.insertMany(evidenceHistory, { ordered: true });

  return {
    evidenceEvents: evidenceHistory.length,
    individualSnapshots: individualHistory.length,
    pairSnapshots: pairHistory.length,
    pairEvaluations: evaluationHistory.length,
  };
};

const explainEvidence = async (input: {
  pairId: Types.ObjectId;
  memberA: string;
}): Promise<{
  pairActivity: { index: string; docsExamined: number; returned: number };
  weeklyCycle: { index: string; docsExamined: number; returned: number };
  pairStateSnapshot: { index: string; docsExamined: number; returned: number };
  factorEvidence: {
    index: string;
    docsExamined: number;
    returned: number;
    maximumEvents: number;
  };
  individualFactorSnapshot: {
    index: string;
    docsExamined: number;
    returned: number;
  };
  pairFactorSnapshot: {
    index: string;
    docsExamined: number;
    returned: number;
  };
  pairFactorEvaluation: {
    index: string;
    docsExamined: number;
    returned: number;
  };
}> => {
  const activityIndex = 'pair_activity_history_by_pair_status_offered';
  const weeklyIndex = 'weekly_cycle_history_by_pair_start';
  const activityExplain = await PairActivity.collection
    .find({
      pairId: input.pairId,
      status: {
        $in: [
          'completed_success',
          'completed_partial',
          'failed',
          'cancelled',
          'expired',
        ],
      },
      offeredAt: { $type: 'date' },
      $and: [
        {
          $or: [
            { visibility: { $exists: false } },
            { visibility: 'both' },
            { visibility: 'privateA' },
          ],
        },
        {
          $or: [
            { 'stateMeta.assignedMemberIds': input.memberA },
            {
              'stateMeta.assignedMemberIds': { $exists: false },
              mode: { $in: ['together', 'soloA'] },
            },
          ],
        },
      ],
    })
    .sort({ offeredAt: -1, _id: -1 })
    .limit(21)
    .explain('executionStats');
  const weeklyExplain = await WeeklyCycle.collection
    .find({
      pairId: input.pairId,
      cycleKey: { $type: 'string' },
      startsAt: { $type: 'date' },
      endsAt: { $lte: LOAD_NOW },
      latestSnapshotId: { $type: 'objectId' },
    })
    .sort({ startsAt: -1, cycleKey: -1 })
    .limit(32)
    .explain('executionStats');
  const snapshot = await PairStateSnapshot.findOne({ pairId: input.pairId })
    .select({ _id: 1 })
    .lean<{ _id: Types.ObjectId } | null>();
  assert.ok(snapshot);
  const snapshotExplain = await PairStateSnapshot.collection
    .find({ _id: snapshot._id })
    .limit(1)
    .explain('executionStats');

  const factor = MVP_FACTOR_REGISTRY.factors.find(
    (candidate) => candidate.key === WEEKLY_FACTOR_KEYS[0]
  );
  assert.ok(factor);
  const strategy = factor.pairStrategies.find(
    (candidate) => candidate.context === 'COMMITTED_RELATIONSHIP'
  );
  assert.ok(strategy);
  const evidenceCutoffAt = new Date();
  const evidenceSelection = factorEvidenceSelectionWindow(
    factor,
    evidenceCutoffAt
  );
  const factorEvidenceIndex = 'factor_evidence_bounded_subject_history';
  const factorEvidenceExplain = await EvidenceEvent.collection
    .find({
      subjectKind: 'INDIVIDUAL',
      subjectId: input.memberA,
      pairId: input.pairId.toHexString(),
      factorKey: factor.key,
      status: 'ACCEPTED',
      'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion,
      'versions.definitionVersion': factor.definitionVersion,
      'versions.algorithmVersion': MVP_FACTOR_REGISTRY.algorithmVersion,
      observedAt: {
        $lte: evidenceSelection.evidenceCutoffAt,
        ...(evidenceSelection.earliestObservedAt
          ? { $gte: evidenceSelection.earliestObservedAt }
          : {}),
      },
      recordedAt: { $lte: evidenceSelection.evidenceCutoffAt },
    })
    .sort({ observedAt: -1, eventId: -1 })
    .limit(evidenceSelection.maximumEvents)
    .hint(factorEvidenceIndex)
    .explain('executionStats');

  const individualFactorIndex =
    'subjectId_1_contextPairId_1_projectionPurpose_1_factorKey_1_revision_-1';
  const individualFactorExplain = await IndividualFactorSnapshot.collection
    .find({
      subjectId: input.memberA,
      contextPairId: input.pairId.toHexString(),
      projectionPurpose: 'PAIR_MODEL',
      factorKey: factor.key,
    })
    .sort({ revision: -1 })
    .limit(1)
    .hint(individualFactorIndex)
    .explain('executionStats');

  const pairFactorIndex = 'pairId_1_factorKey_1_revision_-1';
  const pairFactorExplain = await PairFactorSnapshot.collection
    .find({ pairId: input.pairId.toHexString(), factorKey: factor.key })
    .sort({ revision: -1 })
    .limit(1)
    .hint(pairFactorIndex)
    .explain('executionStats');

  const pairEvaluationIndex = 'pair_factor_evaluation_current_history';
  const pairEvaluationExplain = await PairFactorEvaluationSnapshot.collection
    .find({
      pairId: input.pairId.toHexString(),
      factorKey: factor.key,
      context: strategy.context,
      strategy: strategy.config.type,
      strategyVersion: strategy.strategyVersion,
      directionality: strategy.directionality,
    })
    .sort({ revision: -1 })
    .limit(1)
    .hint(pairEvaluationIndex)
    .explain('executionStats');

  const activityExplainText = JSON.stringify(activityExplain);
  const weeklyExplainText = JSON.stringify(weeklyExplain);
  const snapshotExplainText = JSON.stringify(snapshotExplain);
  const factorEvidenceExplainText = JSON.stringify(factorEvidenceExplain);
  const individualFactorExplainText = JSON.stringify(individualFactorExplain);
  const pairFactorExplainText = JSON.stringify(pairFactorExplain);
  const pairEvaluationExplainText = JSON.stringify(pairEvaluationExplain);
  assert.match(activityExplainText, new RegExp(activityIndex));
  assert.match(weeklyExplainText, new RegExp(weeklyIndex));
  assert.match(snapshotExplainText, /_id_/);
  assert.match(factorEvidenceExplainText, new RegExp(factorEvidenceIndex));
  assert.match(individualFactorExplainText, new RegExp(individualFactorIndex));
  assert.match(pairFactorExplainText, new RegExp(pairFactorIndex));
  assert.match(pairEvaluationExplainText, new RegExp(pairEvaluationIndex));

  return {
    pairActivity: {
      index: activityIndex,
      docsExamined: activityExplain.executionStats.totalDocsExamined,
      returned: activityExplain.executionStats.nReturned,
    },
    weeklyCycle: {
      index: weeklyIndex,
      docsExamined: weeklyExplain.executionStats.totalDocsExamined,
      returned: weeklyExplain.executionStats.nReturned,
    },
    pairStateSnapshot: {
      index: '_id_',
      docsExamined: snapshotExplain.executionStats.totalDocsExamined,
      returned: snapshotExplain.executionStats.nReturned,
    },
    factorEvidence: {
      index: factorEvidenceIndex,
      docsExamined: factorEvidenceExplain.executionStats.totalDocsExamined,
      returned: factorEvidenceExplain.executionStats.nReturned,
      maximumEvents: evidenceSelection.maximumEvents,
    },
    individualFactorSnapshot: {
      index: individualFactorIndex,
      docsExamined: individualFactorExplain.executionStats.totalDocsExamined,
      returned: individualFactorExplain.executionStats.nReturned,
    },
    pairFactorSnapshot: {
      index: pairFactorIndex,
      docsExamined: pairFactorExplain.executionStats.totalDocsExamined,
      returned: pairFactorExplain.executionStats.nReturned,
    },
    pairFactorEvaluation: {
      index: pairEvaluationIndex,
      docsExamined: pairEvaluationExplain.executionStats.totalDocsExamined,
      returned: pairEvaluationExplain.executionStats.nReturned,
    },
  };
};

const main = async (): Promise<void> => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(mongodbUri, {
    maxPoolSize: RUN_CONCURRENCY + 4,
    serverSelectionTimeoutMS: 5_000,
  });

  const runId = `release-load-${randomUUID()}`;
  const memberA = `${runId}-a`;
  const memberB = `${runId}-b`;
  const memberObjectIds = [new Types.ObjectId(), new Types.ObjectId()] as const;
  const pairId = new Types.ObjectId();
  const pairKey = [memberA, memberB].sort().join('|');
  const providerSubscriptionId = `${runId}-canonical-subscription`;
  const notificationSourceKey = `${runId}-summary-ready`;
  const auditRequest: AuditRequestContext = {
    route: '/internal/release-load-smoke',
    method: 'POST',
  };
  const seedStartedAt = performance.now();

  try {
    await Promise.all([
      Pair.createIndexes(),
      PairActivity.createIndexes(),
      WeeklyCycle.createIndexes(),
      PairStateSnapshot.createIndexes(),
      Notification.createIndexes(),
      Subscription.createIndexes(),
      WeeklyCheckIn.createIndexes(),
      RecommendationDecision.createIndexes(),
      EvidenceEvent.createIndexes(),
      IndividualFactorSnapshot.createIndexes(),
      PairFactorSnapshot.createIndexes(),
      PairFactorEvaluationSnapshot.createIndexes(),
      EventLog.createIndexes(),
    ]);

    await User.create([
      userFixture(memberA, 'release-load-a'),
      userFixture(memberB, 'release-load-b'),
    ]);

    const pair = await Pair.create({
      _id: pairId,
      members: [memberA, memberB],
      key: pairKey,
      status: 'active',
    });

    const cycleRows = Array.from({ length: CYCLE_COUNT }, (_, index) => {
      const cycleId = new Types.ObjectId();
      const snapshotId = new Types.ObjectId();
      const startsAt = new Date(
        LOAD_NOW.getTime() - (index * 7 + 9) * DAY_MS
      );
      const endsAt = new Date(startsAt.getTime() + 7 * DAY_MS);
      const cycleKey = `${runId}-${String(index).padStart(4, '0')}`;
      return {
        cycle: {
          _id: cycleId,
          pairId,
          cycleKey,
          startsAt,
          endsAt,
          expiresAt: endsAt,
          timeZone: 'UTC' as const,
          status: 'EXPIRED' as const,
          memberIds: [memberA, memberB] as [string, string],
          memberCompletion: [
            { userId: memberA, status: 'SUBMITTED' as const },
            { userId: memberB, status: 'SUBMITTED' as const },
          ],
          pairReadiness: 'ENOUGH' as const,
          submissionCount: 2,
          submissionClaims: [],
          inputDefinitionVersion: 'weekly-input-v1',
          algorithmVersion: 'weekly-cycle-v1',
          latestSnapshotId: snapshotId,
          latestSnapshotRevision: 1,
          expiredReconciliationCompletedAt: endsAt,
        },
        snapshot: {
          _id: snapshotId,
          pairId,
          cycleId,
          cycleKey,
          revision: 1,
          memberCompletion: [
            { userId: memberA, status: 'SUBMITTED' as const },
            { userId: memberB, status: 'SUBMITTED' as const },
          ],
          dataStatus: 'ENOUGH' as const,
          reasonCodes: ['PAIR_SIGNALS_READY' as const],
          signals: [
            {
              key: 'connection' as const,
              status: 'STEADY' as const,
              reasonCode: 'PAIR_LEVEL_STEADY' as const,
              nextStepHint: 'KEEP_CURRENT_RHYTHM' as const,
            },
          ],
          input: {
            definitionVersion: 'weekly-input-v1',
            evidenceRevisionIds: [],
            hash: `${runId}-snapshot-${index}`,
            cycleStatus: 'EXPIRED' as const,
            timeZone: 'UTC' as const,
          },
          algorithm: { version: 'weekly-cycle-v1' },
          displayVersion: 'pair-state-display-v1',
          generatedAt: endsAt,
        },
      };
    });
    await WeeklyCycle.insertMany(cycleRows.map((row) => row.cycle), {
      ordered: true,
    });
    await PairStateSnapshot.insertMany(
      cycleRows.map((row) => row.snapshot),
      { ordered: true }
    );

    const terminalStatuses = [
      'completed_success',
      'completed_partial',
      'failed',
      'cancelled',
      'expired',
    ] as const;
    await PairActivity.insertMany(
      Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({
        pairId,
        members: memberObjectIds,
        intent: index % 2 === 0 ? ('improve' as const) : ('celebrate' as const),
        archetype: 'micro_habit' as const,
        actionDefinition: SYSTEM_ACTIVITY_TEMPLATES[0].actionDefinition,
        targetFactorKeys: SYSTEM_ACTIVITY_TEMPLATES[0].targetFactorKeys,
        title: { ru: `Synthetic activity ${index}`, en: `Synthetic ${index}` },
        why: { ru: 'Synthetic load evidence', en: 'Synthetic load evidence' },
        mode:
          index % 3 === 0
            ? ('together' as const)
            : index % 3 === 1
              ? ('soloA' as const)
              : ('soloB' as const),
        sync: 'async' as const,
        difficulty: 1 as const,
        intensity: 1 as const,
        offeredAt: new Date(
          LOAD_NOW.getTime() - SYNTHETIC_HISTORY_OFFSET_MS - index * 60 * 60 * 1000
        ),
        visibility:
          index % 5 === 0
            ? ('privateA' as const)
            : index % 7 === 0
              ? ('privateB' as const)
              : ('both' as const),
        status: terminalStatuses[index % terminalStatuses.length],
        stateMeta:
          index % 4 === 0 ? { assignedMemberIds: [memberA] } : undefined,
        answers:
          index % 2 === 0
            ? [
                {
                  checkInId: 'usefulness',
                  by: 'A' as const,
                  ui: 4,
                  at: new Date(
                    LOAD_NOW.getTime() -
                      SYNTHETIC_HISTORY_OFFSET_MS -
                      index * 60 * 60 * 1000
                  ),
                },
              ]
            : [],
        createdBy: 'system' as const,
      })),
      { ordered: true }
    );

    const notificationRows = [memberA, memberB].flatMap((userId) =>
      Array.from({ length: NOTIFICATIONS_PER_USER }, (_, index) => ({
        userId,
        pairId,
        type: 'CYCLE_AVAILABLE' as const,
        dedupeKey: `${runId}-${userId}-${index}`,
        expiresAt: new Date(LOAD_NOW.getTime() + 30 * DAY_MS),
        createdAt: new Date(LOAD_NOW.getTime() - index * 60_000),
        updatedAt: new Date(LOAD_NOW.getTime() - index * 60_000),
      }))
    );
    await Notification.insertMany(notificationRows, { ordered: true });

    const subscriptionRows = [
      {
        userId: memberA,
        pairId,
        billingOwnerUserId: memberA,
        provider: 'sandbox' as const,
        providerSubscriptionId,
        plan: 'COUPLE' as const,
        status: 'active' as const,
        periodEnd: new Date(LOAD_NOW.getTime() + 30 * DAY_MS),
      },
      ...[memberA, memberB].flatMap((userId) =>
        Array.from(
          { length: LEGACY_SUBSCRIPTIONS_PER_USER },
          (_, index) => ({
            userId,
            plan: 'SOLO' as const,
            status: 'expired' as const,
            periodEnd: new Date(LOAD_NOW.getTime() - (index + 1) * DAY_MS),
          })
        )
      ),
    ];
    await Subscription.insertMany(subscriptionRows, { ordered: true });

    const seedMs = roundMs(performance.now() - seedStartedAt);
    const warmHistory = await pairHistoryService.list({
      pair,
      role: 'A',
      limit: PAGE_LIMIT,
      now: LOAD_NOW,
    });
    assert.equal(warmHistory.items.length, PAGE_LIMIT);
    await notificationService.list({ currentUserId: memberA, limit: PAGE_LIMIT });
    const warmEntitlement = await resolveEntitlements({
      currentUserId: memberA,
      pairId: String(pairId),
    });
    assert.equal(warmEntitlement.plan, 'COUPLE');

    const dashboardRead = await runConcurrentScenario({
      samples: DASHBOARD_SAMPLES,
      concurrency: RUN_CONCURRENCY,
      operation: async (sample) => {
        const dashboard = await buildPairDashboardSummary({
          pair,
          currentUserId: sample % 2 === 0 ? memberA : memberB,
        });
        assert.equal(dashboard.pair.id, String(pairId));
      },
    });

    const loadCycleKey = weeklyCycleKeyForDate(LOAD_NOW);
    const weeklyAnswers = [
      {
        closeness: 0.74,
        fatigue: 0.27,
        irritation: 0.16,
        readiness: 0.82,
        unresolvedTopic: false,
      },
      {
        closeness: 0.68,
        fatigue: 0.33,
        irritation: 0.21,
        readiness: 0.76,
        unresolvedTopic: false,
      },
    ] as const;
    const weeklySubmit = await runConcurrentScenario({
      samples: WEEKLY_SUBMISSION_SAMPLES,
      concurrency: WEEKLY_SUBMISSION_SAMPLES,
      operation: async (sample) => {
        await weeklyCheckInService.submit({
          currentUserId: sample === 0 ? memberA : memberB,
          pairId: String(pairId),
          weekKey: loadCycleKey,
          answers: weeklyAnswers[sample] ?? weeklyAnswers[0],
          auditRequest,
        });
      },
    });

    const loadCycle = await WeeklyCycle.findOne({
      pairId,
      cycleKey: loadCycleKey,
    });
    assert.ok(loadCycle?.latestSnapshotId, 'weekly submissions did not publish a snapshot');

    const factorSeedStartedAt = performance.now();
    const deepFactorFixture = await seedDeepFactorHistory({
      runId,
      pairId: String(pairId),
      memberIds: [memberA, memberB],
    });
    const factorSeedMs = roundMs(performance.now() - factorSeedStartedAt);

    const repeatedRecommendation = await runConcurrentScenario({
      samples: RECOMMENDATION_SAMPLES,
      concurrency: RUN_CONCURRENCY,
      operation: async (sample) => {
        const decision = await recommendationWorkflowService.offer({
          pairId: String(pairId),
          currentUserId: sample % 2 === 0 ? memberA : memberB,
          auditRequest,
        });
        assert.equal(decision.cycleKey, loadCycleKey);
      },
    });

    const offeredDecision = await RecommendationDecision.findOne({
      pairId,
      cycleKey: loadCycleKey,
      status: 'OFFERED',
    });
    assert.ok(offeredDecision, 'recommendation load did not create a canonical decision');
    const decisionId = String(offeredDecision._id);
    const activityId = String(offeredDecision.activityId);
    await recommendationWorkflowService.accept({
      pairId: String(pairId),
      decisionId,
      currentUserId: memberA,
      auditRequest,
    });
    await activitiesService.startActivity({
      activityId,
      currentUserId: memberA,
      auditRequest,
    });
    const activityForFeedback = await PairActivity.findById(activityId).lean<
      PairActivityType & { _id: Types.ObjectId }
    >();
    assert.ok(activityForFeedback, 'recommended activity was not found');
    const positiveFeedback = activityForFeedback.checkIns.map((checkIn) => ({
      checkInId: checkIn.id,
      ui: checkIn.map.length,
    }));
    assert.ok(positiveFeedback.length > 0, 'recommended activity has no feedback fields');
    await activitiesService.checkinActivity({
      activityId,
      currentUserId: memberA,
      answers: positiveFeedback,
      auditRequest,
    });
    await activitiesService.checkinActivity({
      activityId,
      currentUserId: memberB,
      answers: positiveFeedback,
      auditRequest,
    });
    const activityCompletionRace = await runConcurrentScenario({
      samples: ACTIVITY_COMPLETION_SAMPLES,
      concurrency: ACTIVITY_COMPLETION_SAMPLES,
      operation: async (sample) => {
        const completed = await activitiesService.completeActivity({
          activityId,
          currentUserId: sample % 2 === 0 ? memberA : memberB,
          auditRequest,
        });
        assert.ok(completed.status.startsWith('completed_'));
      },
    });

    const summaryNotificationsBeforeDedupeLoad = await Notification.countDocuments({
      pairId,
      userId: { $in: [memberA, memberB] },
      type: 'SUMMARY_READY',
    });

    const notificationCreate = await runConcurrentScenario({
      samples: NOTIFICATION_CREATE_SAMPLES,
      concurrency: RUN_CONCURRENCY,
      operation: async () => {
        await notificationService.create({
          userIds: [memberA, memberB],
          pairId: String(pairId),
          type: 'SUMMARY_READY',
          sourceKey: notificationSourceKey,
          now: LOAD_NOW,
        });
      },
    });
    const historyPagination = await runConcurrentScenario({
      samples: HISTORY_SAMPLES,
      concurrency: RUN_CONCURRENCY,
      operation: async () => {
        const firstPage = await pairHistoryService.list({
          pair,
          role: 'A',
          limit: PAGE_LIMIT,
          now: LOAD_NOW,
        });
        assert.equal(firstPage.items.length, PAGE_LIMIT);
        assert.ok(firstPage.nextCursor);
        const secondPage = await pairHistoryService.list({
          pair,
          role: 'A',
          cursor: firstPage.nextCursor,
          limit: PAGE_LIMIT,
          now: LOAD_NOW,
        });
        assert.equal(secondPage.items.length, PAGE_LIMIT);
        assert.equal(
          new Set([...firstPage.items, ...secondPage.items].map((item) => `${item.kind}:${item.id}`))
            .size,
          PAGE_LIMIT * 2
        );
      },
    });
    const notificationPagination = await runConcurrentScenario({
      samples: NOTIFICATION_SAMPLES,
      concurrency: RUN_CONCURRENCY,
      operation: async (sample) => {
        const firstPage = await notificationService.list({
          currentUserId: sample % 2 === 0 ? memberA : memberB,
          limit: PAGE_LIMIT,
        });
        assert.equal(firstPage.items.length, PAGE_LIMIT);
        assert.ok(firstPage.nextCursor);
        const secondPage = await notificationService.list({
          currentUserId: sample % 2 === 0 ? memberA : memberB,
          cursor: firstPage.nextCursor,
          limit: PAGE_LIMIT,
        });
        assert.equal(secondPage.items.length, PAGE_LIMIT);
        assert.equal(
          new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size,
          PAGE_LIMIT * 2
        );
      },
    });
    const entitlementRead = await runConcurrentScenario({
      samples: ENTITLEMENT_SAMPLES,
      concurrency: RUN_CONCURRENCY,
      operation: async (sample) => {
        const entitlements = await resolveEntitlements({
          currentUserId: sample % 2 === 0 ? memberA : memberB,
          pairId: String(pairId),
        });
        assert.equal(entitlements.plan, 'COUPLE');
        assert.equal(entitlements.source, 'pair_subscription');
      },
    });

    const canonicalNotificationCount = await Notification.countDocuments({
      pairId,
      userId: { $in: [memberA, memberB] },
      type: 'SUMMARY_READY',
    });
    const canonicalNotificationCreateCount =
      canonicalNotificationCount - summaryNotificationsBeforeDedupeLoad;
    const duplicateNotifications = await Notification.aggregate<{
      _id: { userId: string; dedupeKey: string };
      count: number;
    }>([
      { $match: { pairId, userId: { $in: [memberA, memberB] } } },
      {
        $group: {
          _id: { userId: '$userId', dedupeKey: '$dedupeKey' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]).exec();
    const duplicateCycles = await WeeklyCycle.aggregate<{
      _id: { pairId: Types.ObjectId; cycleKey: string };
      count: number;
    }>([
      { $match: { pairId } },
      {
        $group: {
          _id: { pairId: '$pairId', cycleKey: '$cycleKey' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]).exec();
    const duplicateSnapshots = await PairStateSnapshot.aggregate<{
      _id: { cycleId: Types.ObjectId; revision: number };
      count: number;
    }>([
      { $match: { pairId } },
      {
        $group: {
          _id: { cycleId: '$cycleId', revision: '$revision' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]).exec();
    const canonicalSubscriptionCount = await Subscription.countDocuments({
      pairId,
      provider: 'sandbox',
      providerSubscriptionId,
    });
    const [
      canonicalCheckInCount,
      canonicalLoadCycleCount,
      canonicalDecisionCount,
      canonicalRecommendedActivityCount,
      finalActivity,
      duplicateActivityEffects,
    ] = await Promise.all([
      WeeklyCheckIn.countDocuments({
        pairId: { $in: [pairId, String(pairId)] },
        weekKey: loadCycleKey,
      }),
      WeeklyCycle.countDocuments({ pairId, cycleKey: loadCycleKey }),
      RecommendationDecision.countDocuments({ pairId, cycleKey: loadCycleKey }),
      PairActivity.countDocuments({
        _id: activityId,
        pairId,
        'recommendationProvenance.cycleId': loadCycle._id,
      }),
      PairActivity.findById(activityId).lean<PairActivityType | null>(),
      EvidenceEvent.aggregate<{ count: number }>([
        {
          $match: {
            sourceRef: {
              $regex: `^pair-activity:${String(activityId)}:(feedback|completion)`,
            },
          },
        },
        {
          $group: {
            _id: {
              eventId: '$eventId',
              factorKey: '$factorKey',
              sourceRevision: '$sourceRevision',
            },
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
      ]),
    ]);

    assert.equal(
      canonicalNotificationCreateCount,
      2,
      `notification dedupe load did not converge: before=${summaryNotificationsBeforeDedupeLoad} after=${canonicalNotificationCount} stats=${JSON.stringify(notificationCreate)}`
    );
    assert.equal(duplicateNotifications.length, 0);
    assert.equal(duplicateCycles.length, 0);
    assert.equal(duplicateSnapshots.length, 0);
    assert.equal(canonicalSubscriptionCount, 1);
    assert.equal(canonicalCheckInCount, 2);
    assert.equal(canonicalLoadCycleCount, 1);
    assert.equal(canonicalDecisionCount, 1);
    assert.equal(canonicalRecommendedActivityCount, 1);
    assert.ok(finalActivity);
    assert.ok(finalActivity.status.startsWith('completed_'));
    const finalFeedback = finalActivity.answers ?? [];
    assert.equal(
      new Set(finalFeedback.map((answer) => `${answer.by}:${answer.checkInId}`)).size,
      finalFeedback.length,
      'completion race left duplicate feedback answers'
    );
    assert.equal(duplicateActivityEffects.length, 0);

    const results = {
      dashboardRead,
      weeklySubmit,
      repeatedRecommendation,
      activityCompletionRace,
      notificationCreate,
      historyPagination,
      notificationPagination,
      entitlementRead,
    };
    const queryEvidence = await explainEvidence({ pairId, memberA });
    const report = {
      runId,
      seedMs,
      factorSeedMs,
      environment: {
        database: databaseName,
        node: process.version,
        guardedDatabaseSuffix: '_test',
        maxPoolSize: RUN_CONCURRENCY + 4,
        measuredAt: LOAD_NOW.toISOString(),
      },
      dataset: {
        synthetic: true,
        runScopedCleanup: true,
        pairs: 1,
        users: 2,
        seededWeeklyCycles: CYCLE_COUNT,
        seededPairStateSnapshots: CYCLE_COUNT,
        seededPairActivities: ACTIVITY_COUNT,
        seededPlusSummaryReadyNotifications:
          notificationRows.length + canonicalNotificationCount,
        subscriptions: subscriptionRows.length,
        factorHistoryDepth: FACTOR_HISTORY_DEPTH,
        seededFactorEvidenceEvents: deepFactorFixture.evidenceEvents,
        seededIndividualFactorSnapshots: deepFactorFixture.individualSnapshots,
        seededPairFactorSnapshots: deepFactorFixture.pairSnapshots,
        seededPairFactorEvaluations: deepFactorFixture.pairEvaluations,
      },
      bounds: {
        concurrency: RUN_CONCURRENCY,
        pageLimit: PAGE_LIMIT,
        dashboardSamples: DASHBOARD_SAMPLES,
        weeklySubmissionSamples: WEEKLY_SUBMISSION_SAMPLES,
        recommendationSamples: RECOMMENDATION_SAMPLES,
        recommendationConcurrency: RUN_CONCURRENCY,
        activityCompletionSamples: ACTIVITY_COMPLETION_SAMPLES,
        historyPaginationSamples: HISTORY_SAMPLES,
        notificationPaginationSamples: NOTIFICATION_SAMPLES,
      },
      results,
      queryEvidence,
      canonical: {
        summaryNotifications: canonicalNotificationCount,
        notificationCreateRows: canonicalNotificationCreateCount,
        duplicateNotificationKeys: duplicateNotifications.length,
        duplicateCycles: duplicateCycles.length,
        duplicateSnapshots: duplicateSnapshots.length,
        providerSubscriptions: canonicalSubscriptionCount,
        weeklyCheckIns: canonicalCheckInCount,
        currentWeeklyCycles: canonicalLoadCycleCount,
        recommendationDecisions: canonicalDecisionCount,
        recommendedActivities: canonicalRecommendedActivityCount,
        duplicateActivityEffects: duplicateActivityEffects.length,
      },
    };
    console.log(JSON.stringify(report));

    for (const [name, stats] of Object.entries(results)) {
      assert.equal(stats.errors, 0, `${name} returned errors`);
      assert.equal(stats.conflicts, 0, `${name} returned conflicts`);
    }
    assert.equal(queryEvidence.pairStateSnapshot.docsExamined, 1);
    assert.equal(queryEvidence.pairStateSnapshot.returned, 1);
    assert.ok(
      queryEvidence.factorEvidence.docsExamined <=
        queryEvidence.factorEvidence.maximumEvents,
      'bounded Factor evidence query examined more documents than its policy cap'
    );
    assert.ok(
      queryEvidence.factorEvidence.maximumEvents <=
        FACTOR_EVIDENCE_SELECTION_MAXIMUM,
      'Factor evidence selection exceeded the global hard cap'
    );
    assert.ok(queryEvidence.factorEvidence.returned > 0);
    assert.equal(queryEvidence.individualFactorSnapshot.docsExamined, 1);
    assert.equal(queryEvidence.individualFactorSnapshot.returned, 1);
    assert.equal(queryEvidence.pairFactorSnapshot.docsExamined, 1);
    assert.equal(queryEvidence.pairFactorSnapshot.returned, 1);
    assert.equal(queryEvidence.pairFactorEvaluation.docsExamined, 1);
    assert.equal(queryEvidence.pairFactorEvaluation.returned, 1);
    for (const [scenario, budgetMs] of Object.entries(P95_BUDGET_MS)) {
      const stats = results[scenario as keyof typeof P95_BUDGET_MS];
      assert.ok(
        stats.p95Ms < budgetMs,
        `${scenario} p95 ${stats.p95Ms}ms must stay below ${budgetMs}ms`
      );
    }
  } finally {
    try {
      await Notification.deleteMany({
        pairId,
        userId: { $in: [memberA, memberB] },
      });
      await EventLog.deleteMany({
        $or: [
          { 'actor.userId': { $in: [memberA, memberB] } },
          { 'context.pairId': String(pairId) },
        ],
      });
      await RecommendationDecision.deleteMany({ pairId });
      await PairActivity.deleteMany({ pairId });
      await PairStateSnapshot.deleteMany({ pairId });
      await WeeklyCheckIn.deleteMany({
        $or: [
          { pairId },
          { pairId: String(pairId) },
          { userId: { $in: [memberA, memberB] } },
        ],
      });
      await EvidenceEvent.deleteMany({
        $or: [
          { pairId: String(pairId) },
          { actorId: { $in: [memberA, memberB] } },
        ],
      });
      await IndividualFactorSnapshot.deleteMany({
        subjectId: { $in: [memberA, memberB] },
      });
      await PairFactorSnapshot.deleteMany({ pairId: String(pairId) });
      await PairFactorEvaluationSnapshot.deleteMany({ pairId: String(pairId) });
      await WeeklyCycle.deleteMany({ pairId });
      await Subscription.deleteMany({
        $or: [
          { pairId },
          {
            userId: { $in: [memberA, memberB] },
            pairId: { $exists: false },
          },
        ],
      });
      await User.deleteMany({ id: { $in: [memberA, memberB] } });
      await Pair.deleteOne({ _id: pairId, key: pairKey });
      const remainingRunScopedRecords = await Promise.all([
        Notification.countDocuments({
          pairId,
          userId: { $in: [memberA, memberB] },
        }),
        EventLog.countDocuments({
          $or: [
            { 'actor.userId': { $in: [memberA, memberB] } },
            { 'context.pairId': String(pairId) },
          ],
        }),
        RecommendationDecision.countDocuments({ pairId }),
        PairActivity.countDocuments({ pairId }),
        PairStateSnapshot.countDocuments({ pairId }),
        WeeklyCheckIn.countDocuments({
          $or: [
            { pairId },
            { pairId: String(pairId) },
            { userId: { $in: [memberA, memberB] } },
          ],
        }),
        EvidenceEvent.countDocuments({
          $or: [
            { pairId: String(pairId) },
            { actorId: { $in: [memberA, memberB] } },
          ],
        }),
        IndividualFactorSnapshot.countDocuments({
          subjectId: { $in: [memberA, memberB] },
        }),
        PairFactorSnapshot.countDocuments({ pairId: String(pairId) }),
        PairFactorEvaluationSnapshot.countDocuments({ pairId: String(pairId) }),
        WeeklyCycle.countDocuments({ pairId }),
        Subscription.countDocuments({
          $or: [
            { pairId },
            {
              userId: { $in: [memberA, memberB] },
              pairId: { $exists: false },
            },
          ],
        }),
        User.countDocuments({ id: { $in: [memberA, memberB] } }),
        Pair.countDocuments({ _id: pairId, key: pairKey }),
      ]);
      assert.equal(
        remainingRunScopedRecords.reduce((sum, count) => sum + count, 0),
        0,
        'load smoke cleanup left run-scoped records'
      );
    } finally {
      await mongoose.disconnect();
    }
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
