import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  runFactorEngineMigration,
  type FactorEngineMigrationMode,
} from './lib/factor-engine-migration';

const APPLY_CONFIRMATION = 'APPLY_NEW_ONLY_FACTOR_MIGRATION';

const argumentValue = (prefix: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);

const apply = process.argv.includes('--apply');
const requestedMode = argumentValue('--mode=');
const mode: FactorEngineMigrationMode = apply ? 'NEW_ONLY' : 'DRY_RUN';
if (apply && requestedMode !== 'NEW_ONLY') {
  throw new Error('Apply requires --mode=NEW_ONLY');
}
if (!apply && requestedMode && requestedMode !== 'NEW_ONLY') {
  throw new Error('The only supported cutover mode is NEW_ONLY');
}
if (
  apply &&
  process.env.FACTOR_ENGINE_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
) {
  throw new Error(
    `Apply requires FACTOR_ENGINE_MIGRATION_CONFIRM=${APPLY_CONFIRMATION}`
  );
}

const rawBatchSize = argumentValue('--batch-size=');
const batchSize = rawBatchSize ? Number(rawBatchSize) : 100;

const main = async (): Promise<void> => {
  const database = await connectToDatabase();
  const databaseName = database.connection.db?.databaseName;
  if (!databaseName) throw new Error('DATABASE_NOT_CONNECTED');
  const report = await runFactorEngineMigration({ mode, batchSize });
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
