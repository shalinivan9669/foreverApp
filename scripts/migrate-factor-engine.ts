import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  runFactorEngineMigration,
  type FactorEngineMigrationMode,
} from './lib/factor-engine-migration';
import {
  ReleaseCommandFailure,
  releaseReasonCounts,
  writeReleaseCommandEvidence,
  writeReleaseCommandFailure,
} from './lib/release-command-output';

const APPLY_CONFIRMATION = 'APPLY_NEW_ONLY_FACTOR_MIGRATION';

const argumentValue = (prefix: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);

type FactorEngineCommandConfig = {
  mode: FactorEngineMigrationMode;
  batchSize: number;
};

const resolveConfig = (): FactorEngineCommandConfig => {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ReleaseCommandFailure('MONGODB_URI_REQUIRED');
  }
  const apply = process.argv.includes('--apply');
  const requestedMode = argumentValue('--mode=');
  const mode: FactorEngineMigrationMode = apply ? 'NEW_ONLY' : 'DRY_RUN';
  if (
    (apply && requestedMode !== 'NEW_ONLY') ||
    (!apply && requestedMode && requestedMode !== 'NEW_ONLY')
  ) {
    throw new ReleaseCommandFailure('MODE_INVALID');
  }
  if (
    apply &&
    process.env.FACTOR_ENGINE_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
  ) {
    throw new ReleaseCommandFailure('APPLY_CONFIRMATION_REQUIRED');
  }
  const rawBatchSize = argumentValue('--batch-size=');
  const batchSize = rawBatchSize ? Number(rawBatchSize) : 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new ReleaseCommandFailure('BATCH_SIZE_INVALID');
  }
  return { mode, batchSize };
};

const main = async (): Promise<void> => {
  const { mode, batchSize } = resolveConfig();
  const database = await connectToDatabase();
  if (!database.connection.db) {
    throw new ReleaseCommandFailure('DATABASE_NOT_CONNECTED');
  }
  const report = await runFactorEngineMigration({ mode, batchSize });
  writeReleaseCommandEvidence({
    counts: {
      registryPresent: Number(report.registry.present),
      registryMatchesCanonical: Number(report.registry.matchesCanonical),
      registryWouldSeed: Number(report.registry.wouldSeed),
      registrySeeded: Number(report.registry.seeded),
      indexesDeclared: report.indexes.declared,
      indexesMissingBefore: report.indexes.missingBefore,
      indexDuplicateUniqueGroups: report.indexes.duplicateUniqueGroups,
      obsoleteIndexExactMatches: report.indexes.obsoleteExactMatches,
      indexesCreated: report.indexes.created,
      obsoleteIndexesDropped: report.indexes.droppedObsoleteExactMatches,
      weeklyScanned: report.weekly.scanned,
      weeklyDeferredAfterCutoff: report.weekly.deferredAfterCutoff,
      weeklyAlreadyMaterialized: report.weekly.alreadyMaterialized,
      weeklyStaleMarkers: report.weekly.staleMarkers,
      weeklyStringPairIds: report.weekly.stringPairIds,
      weeklyWouldNormalizePairIds: report.weekly.wouldNormalizePairIds,
      weeklyNormalizedPairIds: report.weekly.normalizedPairIds,
      weeklyReplayEligible: report.weekly.replayEligible,
      weeklyReplayed: report.weekly.replayed,
      weeklyUnreplayable: Object.values(report.weekly.unreplayable).reduce(
        (total, count) => total + count,
        0
      ),
      onboardingScanned: report.onboarding.scanned,
      onboardingDeferredAfterCutoff: report.onboarding.deferredAfterCutoff,
      onboardingAlreadyMaterialized: report.onboarding.alreadyMaterialized,
      onboardingStaleMarkers: report.onboarding.staleMarkers,
      onboardingReplayEligible: report.onboarding.replayEligible,
      onboardingReplayed: report.onboarding.replayed,
      onboardingUnreplayable: Object.values(
        report.onboarding.unreplayable
      ).reduce((total, count) => total + count, 0),
    },
    reasonCounts: releaseReasonCounts({
      WEEKLY_PAIR_ID_INVALID: report.weekly.unreplayable.PAIR_ID_INVALID,
      WEEKLY_PAIR_NOT_FOUND: report.weekly.unreplayable.PAIR_NOT_FOUND,
      WEEKLY_PAIR_MEMBERS_INVALID:
        report.weekly.unreplayable.PAIR_MEMBERS_INVALID,
      WEEKLY_USER_NOT_PAIR_MEMBER:
        report.weekly.unreplayable.USER_NOT_PAIR_MEMBER,
      WEEKLY_PAIR_SCOPE_COLLISION:
        report.weekly.unreplayable.PAIR_SCOPE_COLLISION,
      WEEKLY_USER_ID_INVALID: report.weekly.unreplayable.USER_ID_INVALID,
      WEEKLY_WEEK_KEY_INVALID: report.weekly.unreplayable.WEEK_KEY_INVALID,
      WEEKLY_RAW_ANSWERS_INVALID:
        report.weekly.unreplayable.RAW_ANSWERS_INVALID,
      WEEKLY_OBSERVED_AT_INVALID:
        report.weekly.unreplayable.OBSERVED_AT_INVALID,
      WEEKLY_NORMALIZATION_RACE:
        report.weekly.unreplayable.NORMALIZATION_RACE,
      WEEKLY_RUNTIME_REPLAY_FAILED:
        report.weekly.unreplayable.RUNTIME_REPLAY_FAILED,
      ONBOARDING_USER_ID_INVALID:
        report.onboarding.unreplayable.USER_ID_INVALID,
      ONBOARDING_POLICY_VERSION_INVALID:
        report.onboarding.unreplayable.POLICY_VERSION_INVALID,
      ONBOARDING_CONSENT_INVALID:
        report.onboarding.unreplayable.CONSENT_INVALID,
      ONBOARDING_COMPLETED_AT_INVALID:
        report.onboarding.unreplayable.COMPLETED_AT_INVALID,
      ONBOARDING_ANSWERS_INVALID:
        report.onboarding.unreplayable.ANSWERS_INVALID,
      ONBOARDING_RUNTIME_REPLAY_FAILED:
        report.onboarding.unreplayable.RUNTIME_REPLAY_FAILED,
    }),
    indexNames: [],
  });
};

void main()
  .finally(async () => {
    await mongoose.disconnect();
  })
  .catch((error: Error) => {
    writeReleaseCommandFailure(error);
    process.exitCode = 1;
  });
