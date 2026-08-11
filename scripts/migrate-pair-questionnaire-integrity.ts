import mongoose from 'mongoose';
import {
  applyPairQuestionnaireIntegrityIndexes,
  inspectPairQuestionnaireIntegrity,
} from './lib/pair-questionnaire-integrity';

const mongodbUri = process.env.MONGODB_URI?.trim();
if (!mongodbUri) throw new Error('MONGODB_URI is required');

const applyIndexes = process.argv.includes('--apply-additive-indexes');

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 5_000,
  });

  try {
    const report = applyIndexes
      ? await applyPairQuestionnaireIntegrityIndexes()
      : await inspectPairQuestionnaireIntegrity();
    console.log(JSON.stringify(report, null, 2));

    if (
      report.duplicateActiveSessionGroups > 0 ||
      report.duplicateAnswerGroups > 0 ||
      report.conflictingCanonicalIndexes.length > 0
    ) {
      throw new Error('Questionnaire integrity preflight found blocking conflicts');
    }
    if (!applyIndexes && report.missingCanonicalIndexes.length > 0) {
      throw new Error(
        'Questionnaire integrity indexes are missing; rerun after review with --apply-additive-indexes'
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
