import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  runPrivacyRequestV2Migration,
  type PrivacyRequestMigrationMode,
} from './lib/privacy-request-v2-migration';

const APPLY_CONFIRMATION = 'APPLY_PRIVACY_REQUEST_V2_MIGRATION';

const argumentValue = (prefix: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);

const apply = process.argv.includes('--apply');
const requestedMode = argumentValue('--mode=');
const mode: PrivacyRequestMigrationMode = apply ? 'PRIVACY_V2' : 'DRY_RUN';
if (apply && requestedMode !== 'PRIVACY_V2') {
  throw new Error('Apply requires --mode=PRIVACY_V2');
}
if (apply && process.env.PRIVACY_REQUEST_MIGRATION_CONFIRM !== APPLY_CONFIRMATION) {
  throw new Error(
    `Apply requires PRIVACY_REQUEST_MIGRATION_CONFIRM=${APPLY_CONFIRMATION}`
  );
}

const rawBatchSize = argumentValue('--batch-size=');
const batchSize = rawBatchSize ? Number(rawBatchSize) : 100;

const main = async (): Promise<void> => {
  if (apply && (process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('Apply requires JWT_SECRET with at least 32 characters');
  }
  const database = await connectToDatabase();
  const databaseName = database.connection.db?.databaseName;
  if (!databaseName) throw new Error('DATABASE_NOT_CONNECTED');
  const report = await runPrivacyRequestV2Migration({ mode, batchSize });
  console.log(JSON.stringify({ database: databaseName, ...report }));
};

void main()
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
