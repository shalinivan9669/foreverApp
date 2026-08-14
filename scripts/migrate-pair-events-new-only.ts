import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import type { PairEventNewOnlyMigrationMode } from './lib/pair-event-new-only-migration';
import {
  ReleaseCommandFailure,
  releaseReasonCounts,
  writeReleaseCommandEvidence,
  writeReleaseCommandFailure,
} from './lib/release-command-output';

const APPLY_CONFIRMATION = 'APPLY_NEW_ONLY_PAIR_EVENT_MIGRATION';

const argumentValue = (prefix: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);

type PairEventCommandConfig = {
  mode: PairEventNewOnlyMigrationMode;
  batchSize: number;
};

const resolveConfig = (): PairEventCommandConfig => {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ReleaseCommandFailure('MONGODB_URI_REQUIRED');
  }
  const apply = process.argv.includes('--apply');
  const requestedMode = argumentValue('--mode=');
  const mode: PairEventNewOnlyMigrationMode = apply ? 'NEW_ONLY' : 'DRY_RUN';
  if (
    (apply && requestedMode !== 'NEW_ONLY') ||
    (!apply && requestedMode && requestedMode !== 'NEW_ONLY')
  ) {
    throw new ReleaseCommandFailure('MODE_INVALID');
  }
  if (
    apply &&
    process.env.PAIR_EVENT_NEW_ONLY_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
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
  const { runPairEventNewOnlyMigration } = await import(
    './lib/pair-event-new-only-migration'
  );
  const database = await connectToDatabase();
  if (!database.connection.db) {
    throw new ReleaseCommandFailure('DATABASE_NOT_CONNECTED');
  }
  const report = await runPairEventNewOnlyMigration({ mode, batchSize });
  writeReleaseCommandEvidence({
    counts: {
      scanned: report.scanned,
      alreadyCanonical: report.alreadyCanonical,
      alreadyMigrated: report.alreadyMigrated,
      safeEligible: report.safeEligible,
      canonicalNeedingScrub: report.canonicalNeedingScrub,
      unsafeLegacy: report.unsafeLegacy,
      invalidOrMixed: report.invalidOrMixed,
      futureConflicts: report.futureConflicts,
      wouldBind: report.wouldBind,
      wouldScrubCanonical: report.wouldScrubCanonical,
      wouldRetireUnsafe: report.wouldRetireUnsafe,
      wouldRetireInvalid: report.wouldRetireInvalid,
      bound: report.bound,
      scrubbedCanonical: report.scrubbedCanonical,
      retiredUnsafe: report.retiredUnsafe,
      retiredInvalid: report.retiredInvalid,
      concurrentSkipped: report.concurrentSkipped,
      evidenceWrites: report.evidenceWrites,
      snapshotWrites: report.snapshotWrites,
    },
    reasonCounts: releaseReasonCounts(report.reasons),
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
