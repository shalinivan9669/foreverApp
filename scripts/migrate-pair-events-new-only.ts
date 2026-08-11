import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import {
  runPairEventNewOnlyMigration,
  type PairEventNewOnlyMigrationMode,
} from './lib/pair-event-new-only-migration';

const APPLY_CONFIRMATION = 'APPLY_NEW_ONLY_PAIR_EVENT_MIGRATION';

const argumentValue = (prefix: string): string | undefined =>
  process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);

const apply = process.argv.includes('--apply');
const requestedMode = argumentValue('--mode=');
const mode: PairEventNewOnlyMigrationMode = apply ? 'NEW_ONLY' : 'DRY_RUN';

if (apply && requestedMode !== 'NEW_ONLY') {
  throw new Error('Apply requires --mode=NEW_ONLY');
}
if (!apply && requestedMode && requestedMode !== 'NEW_ONLY') {
  throw new Error('The only supported cutover mode is NEW_ONLY');
}
if (
  apply &&
  process.env.PAIR_EVENT_NEW_ONLY_MIGRATION_CONFIRM !== APPLY_CONFIRMATION
) {
  throw new Error(
    `Apply requires PAIR_EVENT_NEW_ONLY_MIGRATION_CONFIRM=${APPLY_CONFIRMATION}`
  );
}

const rawBatchSize = argumentValue('--batch-size=');
const batchSize = rawBatchSize ? Number(rawBatchSize) : 100;

const main = async (): Promise<void> => {
  const database = await connectToDatabase();
  const databaseName = database.connection.db?.databaseName;
  if (!databaseName) throw new Error('DATABASE_NOT_CONNECTED');
  const report = await runPairEventNewOnlyMigration({ mode, batchSize });
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
