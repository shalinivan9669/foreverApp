import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  runPrivacyRequestV2Migration,
  type PrivacyRequestMigrationMode,
} from './lib/privacy-request-v2-migration';
import {
  ReleaseCommandFailure,
  writeReleaseCommandEvidence,
  writeReleaseCommandFailure,
} from './lib/release-command-output';

const APPLY_CONFIRMATION = 'APPLY_PRIVACY_REQUEST_V2_MIGRATION';

const argumentValue = (prefix: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);

type PrivacyRequestCommandConfig = {
  apply: boolean;
  mode: PrivacyRequestMigrationMode;
  batchSize: number;
};

const resolveConfig = (): PrivacyRequestCommandConfig => {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ReleaseCommandFailure('MONGODB_URI_REQUIRED');
  }
  const apply = process.argv.includes('--apply');
  const requestedMode = argumentValue('--mode=');
  const mode: PrivacyRequestMigrationMode = apply ? 'PRIVACY_V2' : 'DRY_RUN';
  if (apply && requestedMode !== 'PRIVACY_V2') {
    throw new ReleaseCommandFailure('MODE_INVALID');
  }
  if (
    apply &&
    process.env.PRIVACY_REQUEST_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
  ) {
    throw new ReleaseCommandFailure('APPLY_CONFIRMATION_REQUIRED');
  }
  const rawBatchSize = argumentValue('--batch-size=');
  const batchSize = rawBatchSize ? Number(rawBatchSize) : 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new ReleaseCommandFailure('BATCH_SIZE_INVALID');
  }
  return { apply, mode, batchSize };
};

const main = async (): Promise<void> => {
  const { apply, mode, batchSize } = resolveConfig();
  if (apply && (process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new ReleaseCommandFailure('JWT_SECRET_INVALID');
  }
  const database = await connectToDatabase();
  if (!database.connection.db) {
    throw new ReleaseCommandFailure('DATABASE_NOT_CONNECTED');
  }
  const report = await runPrivacyRequestV2Migration({ mode, batchSize });
  writeReleaseCommandEvidence({
    counts: {
      scanned: report.scanned,
      eligible: report.eligible,
      migrated: report.migrated,
      invalidOwner: report.invalidOwner,
      unsupportedStatus: report.unsupportedStatus,
      pendingIdentityConflicts: report.pendingIdentityConflicts,
      legacyExactIndexes: report.legacyExactIndexes,
      unexpectedCanonicalNameConflicts:
        report.unexpectedCanonicalNameConflicts,
      canonicalIndexMissingBefore: Number(
        report.canonicalIndexMissingBefore
      ),
      droppedLegacyExactIndexes: report.droppedLegacyExactIndexes,
      createdCanonicalIndexes: report.createdCanonicalIndexes,
    },
    reasonCounts: {},
    indexNames: ['privacy_request_one_confirmable_per_owner_v2'],
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
