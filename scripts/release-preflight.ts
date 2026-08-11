import mongoose from 'mongoose';
import { canonicalizeFactorRegistry } from '@/domain/model/definitions/registry';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { Pair } from '@/models/Pair';
import { PairInvite } from '@/models/PairInvite';
import { PairMembershipClaim } from '@/models/PairMembershipClaim';
import { WeeklyCheckIn } from '@/models/WeeklyCheckIn';
import { WeeklyCycle } from '@/models/WeeklyCycle';
import { PairStateSnapshot } from '@/models/PairStateSnapshot';
import { RecommendationDecision } from '@/models/RecommendationDecision';
import { PairActivity } from '@/models/PairActivity';
import { IdempotencyRecord } from '@/models/IdempotencyRecord';
import { RateLimitBucket } from '@/models/RateLimitBucket';
import { EventLog } from '@/models/EventLog';
import { Notification } from '@/models/Notification';
import { Subscription } from '@/models/Subscription';
import { BillingWebhookEvent } from '@/models/BillingWebhookEvent';
import { PrivacyRequest } from '@/models/PrivacyRequest';
import { Like } from '@/models/Like';
import { ActivityTemplate } from '@/models/ActivityTemplate';
import {
  Questionnaire,
  publishedQuestionnaireFilter,
} from '@/models/Questionnaire';
import { EntitlementQuotaUsage } from '@/models/EntitlementQuotaUsage';
import { MvpOnboardingSession } from '@/models/MvpOnboardingSession';
import { PairEvent } from '@/models/PairEvent';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import { PartnerSignal } from '@/models/PartnerSignal';
import { PersonalDailyCheckIn } from '@/models/PersonalDailyCheckIn';
import { PersonalQuestionnaireSubmission } from '@/models/PersonalQuestionnaireSubmission';
import { RelationshipActivity } from '@/models/RelationshipActivity';
import { SafetyGate } from '@/models/SafetyGate';
import { User } from '@/models/User';
import { DefinitionRegistryRelease } from '@/models/DefinitionRegistryRelease';
import { EvidenceEvent } from '@/models/EvidenceEvent';
import { IndividualFactorSnapshot } from '@/models/IndividualFactorSnapshot';
import { PairFactorEvaluationSnapshot } from '@/models/PairFactorEvaluationSnapshot';
import { PairFactorSnapshot } from '@/models/PairFactorSnapshot';
import { SessionSubject } from '@/models/SessionSubject';
import { runFactorEngineMigration } from './lib/factor-engine-migration';

type CountRow = { groups: number };
type Finding = {
  key: string;
  count: number;
  blocking: boolean;
};

const LEGACY_WEEKLY_USER_INDEX = { userId: 1, weekKey: 1 };
const LEGACY_PAIR_KEY_INDEX = { key: 1 };

const sameIndexKey = (actual: object, expected: object): boolean => {
  const actualEntries = Object.entries(actual);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([key, value], index) =>
        expectedEntries[index]?.[0] === key && expectedEntries[index]?.[1] === value
    )
  );
};

const applyIndexes = process.argv.includes('--apply-additive-indexes');
const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) {
  throw new Error('MONGODB_URI is required');
}

const countGroups = (rows: CountRow[]): number => rows[0]?.groups ?? 0;

const main = async (): Promise<void> => {
await mongoose.connect(mongodbUri, {
  autoIndex: false,
  maxPoolSize: 2,
  serverSelectionTimeoutMS: 5_000,
});

try {
  const [
    duplicateActiveMemberships,
    malformedPairs,
    duplicateActiveInvites,
    duplicateClaims,
    duplicatePairCheckIns,
    duplicateCycles,
    duplicateSnapshots,
    duplicateLikeCreationKeys,
    duplicateOfferedDecisions,
    duplicateNotifications,
    duplicateBillingEvents,
    duplicatePairProviderSubscriptions,
    duplicateCurrentPairProviderSubscriptions,
    ambiguousLegacyPairProviderSubscriptions,
    duplicatePendingPrivacyRequests,
    legacyActivityContent,
    unpublishedActivityContent,
    publishedActivityContent,
    validPublishedActivityContent,
    legacyQuestionnaireContent,
    unpublishedQuestionnaireContent,
    publishedQuestionnaireContent,
    validPublishedQuestionnaireContent,
  ] = await Promise.all([
    Pair.aggregate<CountRow>([
      { $match: { status: { $in: ['active', 'paused'] } } },
      { $unwind: '$members' },
      { $group: { _id: '$members', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    Pair.aggregate<CountRow>([
      {
        $match: {
          $expr: {
            $or: [
              { $ne: [{ $size: { $ifNull: ['$members', []] } }, 2] },
              {
                $eq: [
                  { $arrayElemAt: [{ $ifNull: ['$members', []] }, 0] },
                  { $arrayElemAt: [{ $ifNull: ['$members', []] }, 1] },
                ],
              },
            ],
          },
        },
      },
      { $count: 'groups' },
    ]),
    PairInvite.aggregate<CountRow>([
      { $match: { status: 'ACTIVE' } },
      { $group: { _id: '$creatorUserId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    PairMembershipClaim.aggregate<CountRow>([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    WeeklyCheckIn.aggregate<CountRow>([
      { $match: { pairId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { pairId: '$pairId', userId: '$userId', weekKey: '$weekKey' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    WeeklyCycle.aggregate<CountRow>([
      { $group: { _id: { pairId: '$pairId', cycleKey: '$cycleKey' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    PairStateSnapshot.aggregate<CountRow>([
      {
        $group: {
          _id: { pairId: '$pairId', cycleKey: '$cycleKey', revision: '$revision' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    Like.aggregate<CountRow>([
      { $match: { creationKeyHash: { $type: 'string' } } },
      {
        $group: {
          _id: { fromId: '$fromId', creationKeyHash: '$creationKeyHash' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    RecommendationDecision.aggregate<CountRow>([
      { $match: { status: 'OFFERED' } },
      { $group: { _id: { pairId: '$pairId', cycleKey: '$cycleKey' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    Notification.aggregate<CountRow>([
      { $group: { _id: { userId: '$userId', dedupeKey: '$dedupeKey' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    BillingWebhookEvent.aggregate<CountRow>([
      { $group: { _id: { provider: '$provider', eventId: '$eventId' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    Subscription.aggregate<CountRow>([
      {
        $match: {
          pairId: { $exists: true },
          provider: { $exists: true },
          providerSubscriptionId: { $type: 'string' },
        },
      },
      {
        $group: {
          _id: {
            pairId: '$pairId',
            provider: '$provider',
            providerSubscriptionId: '$providerSubscriptionId',
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    Subscription.aggregate<CountRow>([
      {
        $match: {
          pairId: { $exists: true },
          provider: { $exists: true },
          providerIsCurrent: true,
        },
      },
      {
        $group: {
          _id: { pairId: '$pairId', provider: '$provider' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    Subscription.aggregate<CountRow>([
      {
        $match: {
          pairId: { $exists: true },
          provider: { $exists: true },
          providerSubscriptionId: { $type: 'string' },
        },
      },
      {
        $group: {
          _id: { pairId: '$pairId', provider: '$provider' },
          identities: { $addToSet: '$providerSubscriptionId' },
          currentCount: {
            $sum: { $cond: [{ $eq: ['$providerIsCurrent', true] }, 1, 0] },
          },
        },
      },
      {
        $match: {
          currentCount: 0,
          $expr: { $gt: [{ $size: '$identities' }, 1] },
        },
      },
      { $count: 'groups' },
    ]),
    PrivacyRequest.aggregate<CountRow>([
      { $match: { status: 'PENDING_CONFIRMATION' } },
      {
        $group: {
          _id: { ownerUserId: '$ownerUserId', kind: '$kind' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'groups' },
    ]),
    ActivityTemplate.countDocuments({ publicationStatus: { $exists: false } }),
    ActivityTemplate.countDocuments({
      publicationStatus: { $in: ['draft', 'in_review', 'retired'] },
    }),
    ActivityTemplate.countDocuments({ publicationStatus: 'published' }),
    ActivityTemplate.countDocuments({
      publicationStatus: 'published',
      contentVersion: { $gte: 1 },
      reviewedAt: { $type: 'date' },
      publishedAt: { $type: 'date' },
      retiredAt: { $exists: false },
    }),
    Questionnaire.countDocuments({ publicationStatus: { $exists: false } }),
    Questionnaire.countDocuments({
      publicationStatus: { $in: ['draft', 'in_review', 'retired'] },
    }),
    Questionnaire.countDocuments({ publicationStatus: 'published' }),
    Questionnaire.countDocuments(publishedQuestionnaireFilter()),
  ]);

  const [
    legacyPrivacyRequests,
    weeklyStringPairIds,
    pendingWeeklyFactorReplay,
    pendingOnboardingFactorReplay,
    canonicalRegistry,
  ] = await Promise.all([
    PrivacyRequest.collection.countDocuments({
      $or: [
        { status: 'PENDING_POLICY_REVIEW' },
        { requestVersion: { $ne: 'privacy-request-v2' } },
        { policyReasonCode: { $ne: 'PRIVACY_MINIMAL_IMMEDIATE_DELETION' } },
        { ownerSubjectHash: { $not: /^[a-f\d]{64}$/ } },
      ],
    }),
    WeeklyCheckIn.collection.countDocuments({ pairId: { $type: 'string' } }),
    WeeklyCheckIn.collection.countDocuments({
      'computed.factorEngine.status': { $ne: 'MATERIALIZED' },
    }),
    MvpOnboardingSession.collection.countDocuments({
      status: 'completed',
      'factorEngine.status': { $ne: 'MATERIALIZED' },
    }),
    DefinitionRegistryRelease.findOne({
      registryKey: MVP_FACTOR_REGISTRY.registryKey,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    })
      .select({
        hash: 1,
        canonicalRegistry: 1,
        algorithmVersion: 1,
        snapshotVersion: 1,
        displayVersion: 1,
        status: 1,
      })
      .lean(),
  ]);
  const canonicalRegistryMatches = Boolean(
    canonicalRegistry &&
      canonicalRegistry.hash === MVP_FACTOR_REGISTRY.hash &&
      canonicalRegistry.canonicalRegistry ===
        canonicalizeFactorRegistry(MVP_FACTOR_REGISTRY) &&
      canonicalRegistry.algorithmVersion ===
        MVP_FACTOR_REGISTRY.algorithmVersion &&
      canonicalRegistry.snapshotVersion === MVP_FACTOR_REGISTRY.snapshotVersion &&
      canonicalRegistry.displayVersion === MVP_FACTOR_REGISTRY.displayVersion &&
      canonicalRegistry.status === 'PUBLISHED'
  );
  const factorMarkerAudit = await runFactorEngineMigration({
    mode: 'DRY_RUN',
    batchSize: 500,
  });

  const findings: Finding[] = [
    { key: 'duplicate-active-membership', count: countGroups(duplicateActiveMemberships), blocking: true },
    { key: 'malformed-pairs', count: countGroups(malformedPairs), blocking: true },
    { key: 'duplicate-active-invites', count: countGroups(duplicateActiveInvites), blocking: true },
    { key: 'duplicate-membership-claims', count: countGroups(duplicateClaims), blocking: true },
    { key: 'duplicate-pair-checkins', count: countGroups(duplicatePairCheckIns), blocking: true },
    { key: 'duplicate-weekly-cycles', count: countGroups(duplicateCycles), blocking: true },
    { key: 'duplicate-pair-snapshots', count: countGroups(duplicateSnapshots), blocking: true },
    {
      key: 'duplicate-like-creation-keys',
      count: countGroups(duplicateLikeCreationKeys),
      blocking: true,
    },
    { key: 'duplicate-offered-decisions', count: countGroups(duplicateOfferedDecisions), blocking: true },
    { key: 'duplicate-notification-dedupe', count: countGroups(duplicateNotifications), blocking: true },
    { key: 'duplicate-billing-events', count: countGroups(duplicateBillingEvents), blocking: true },
    {
      key: 'duplicate-pair-provider-subscriptions',
      count: countGroups(duplicatePairProviderSubscriptions),
      blocking: true,
    },
    {
      key: 'duplicate-current-pair-provider-subscriptions',
      count: countGroups(duplicateCurrentPairProviderSubscriptions),
      blocking: true,
    },
    {
      key: 'ambiguous-legacy-pair-provider-subscriptions',
      count: countGroups(ambiguousLegacyPairProviderSubscriptions),
      blocking: true,
    },
    {
      key: 'duplicate-pending-privacy-requests',
      count: countGroups(duplicatePendingPrivacyRequests),
      blocking: true,
    },
    {
      key: 'legacy-privacy-requests-v1',
      count: legacyPrivacyRequests,
      blocking: true,
    },
    {
      key: 'weekly-string-pair-ids',
      count: weeklyStringPairIds,
      blocking: true,
    },
    {
      key: 'pending-weekly-factor-replay',
      count: pendingWeeklyFactorReplay,
      blocking: false,
    },
    {
      key: 'pending-onboarding-factor-replay',
      count: pendingOnboardingFactorReplay,
      blocking: false,
    },
    {
      key: 'stale-materialized-factor-markers',
      count:
        factorMarkerAudit.weekly.staleMarkers +
        factorMarkerAudit.onboarding.staleMarkers,
      blocking: true,
    },
    {
      key: 'canonical-factor-registry-missing-or-conflicting',
      count: canonicalRegistryMatches ? 0 : 1,
      blocking: true,
    },
    {
      key: 'legacy-activity-content-not-publishable',
      count: legacyActivityContent,
      blocking: false,
    },
    {
      key: 'unpublished-activity-content',
      count: unpublishedActivityContent,
      blocking: false,
    },
    {
      key: 'invalid-published-activity-content',
      count: publishedActivityContent - validPublishedActivityContent,
      blocking: true,
    },
    {
      key: 'legacy-questionnaire-content-not-publishable',
      count: legacyQuestionnaireContent,
      blocking: false,
    },
    {
      key: 'unpublished-questionnaire-content',
      count: unpublishedQuestionnaireContent,
      blocking: false,
    },
    {
      key: 'invalid-published-questionnaire-content',
      count: publishedQuestionnaireContent - validPublishedQuestionnaireContent,
      blocking: true,
    },
  ];

  const models = [
    Pair,
    PairInvite,
    PairMembershipClaim,
    WeeklyCheckIn,
    WeeklyCycle,
    PairStateSnapshot,
    RecommendationDecision,
    PairActivity,
    Like,
    IdempotencyRecord,
    RateLimitBucket,
    EventLog,
    Notification,
    Subscription,
    BillingWebhookEvent,
    PrivacyRequest,
    ActivityTemplate,
    Questionnaire,
    EntitlementQuotaUsage,
    MvpOnboardingSession,
    PairEvent,
    PairQuestionnaireAnswer,
    PairQuestionnaireSession,
    PartnerSignal,
    PersonalDailyCheckIn,
    PersonalQuestionnaireSubmission,
    RelationshipActivity,
    SafetyGate,
    User,
    DefinitionRegistryRelease,
    EvidenceEvent,
    IndividualFactorSnapshot,
    PairFactorSnapshot,
    PairFactorEvaluationSnapshot,
    SessionSubject,
  ];

  for (const model of models) {
    const uniqueIndexes = model.schema
      .indexes()
      .filter(([, options]) => options.unique === true);
    for (const [indexKey, options] of uniqueIndexes) {
      const fields = Object.keys(indexKey);
      if (fields.length === 0) continue;
      const pipeline: mongoose.mongo.Document[] = [];
      if (options.partialFilterExpression) {
        pipeline.push({ $match: options.partialFilterExpression });
      }
      if (options.sparse === true) {
        pipeline.push({
          $match: {
            $or: fields.map((field) => ({ [field]: { $exists: true } })),
          },
        });
      }
      pipeline.push(
        {
          $group: {
            _id: Object.fromEntries(
              fields.map((field, index) => ['f' + index, '$' + field])
            ),
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $count: 'groups' }
      );
      const duplicateRows = await model.collection
        .aggregate<CountRow>(pipeline)
        .toArray();
      const indexName =
        typeof options.name === 'string'
          ? options.name
          : Object.entries(indexKey)
              .map(
                ([field, direction]) =>
                  field + '_' + String(direction)
              )
              .join('_');
      findings.push({
        key:
          'duplicate-unique-index:' +
          model.collection.collectionName +
          ':' +
          indexName,
        count: countGroups(duplicateRows),
        blocking: true,
      });
    }
  }

  let weeklyIndexes: mongoose.mongo.IndexDescriptionInfo[] = [];
  try {
    weeklyIndexes = await WeeklyCheckIn.collection.indexes();
  } catch (error) {
    if (
      !(error instanceof mongoose.mongo.MongoServerError) ||
      error.codeName !== 'NamespaceNotFound'
    ) {
      throw error;
    }
  }
  const legacyWeeklyUniqueIndexes = weeklyIndexes.filter(
    (index) =>
      index.unique === true &&
      sameIndexKey(index.key, LEGACY_WEEKLY_USER_INDEX)
  );
  findings.push({
    key: 'legacy-weekly-user-week-unique-index',
    count: legacyWeeklyUniqueIndexes.length,
    blocking: true,
  });

  let pairIndexes: mongoose.mongo.IndexDescriptionInfo[] = [];
  try {
    pairIndexes = await Pair.collection.indexes();
  } catch (error) {
    if (
      !(error instanceof mongoose.mongo.MongoServerError) ||
      error.codeName !== 'NamespaceNotFound'
    ) {
      throw error;
    }
  }
  const legacyPairUniqueIndexes = pairIndexes.filter(
    (index) =>
      index.unique === true &&
      sameIndexKey(index.key, LEGACY_PAIR_KEY_INDEX)
  );
  findings.push({
    key: 'legacy-pair-key-unique-index',
    count: legacyPairUniqueIndexes.length,
    blocking: true,
  });

  const indexDiffs: Array<{
    collection: string;
    missing: number;
    extra: number;
  }> = [];
  for (const model of models) {
    const diff = await model.diffIndexes();
    indexDiffs.push({
      collection: model.collection.collectionName,
      missing: diff.toCreate.length,
      extra: diff.toDrop.length,
    });
  }

  const blockers = findings.filter((finding) => finding.blocking && finding.count > 0);
  for (const finding of findings) {
    if (finding.count > 0) {
      console.log(`preflight ${finding.key}: ${finding.count}`);
    }
  }
  if (blockers.length > 0) {
    throw new Error(`Release preflight found ${blockers.length} blocking data invariant(s)`);
  }

  const missingIndexCount = indexDiffs.reduce((total, item) => total + item.missing, 0);
  const extraIndexCount = indexDiffs.reduce((total, item) => total + item.extra, 0);
  console.log(`preflight data invariants: passed (${findings.length} checks)`);
  console.log(`preflight indexes: missing=${missingIndexCount} extra=${extraIndexCount}`);

  if (extraIndexCount > 0) {
    throw new Error(
      'Undeclared indexes are present; release is blocked until every extra index is reviewed and reconciled'
    );
  }
  if (applyIndexes) {
    for (const model of models) {
      await model.createIndexes();
    }
    console.log('preflight additive indexes: applied');
  } else if (missingIndexCount > 0) {
    throw new Error(
      'Declared indexes are missing; rerun after review with --apply-additive-indexes'
    );
  }
} finally {
  await mongoose.disconnect();
}
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
