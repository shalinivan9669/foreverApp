import mongoose from 'mongoose';
import {
  applyPairQuestionnaireIntegrityIndexes,
  formatPairQuestionnaireIntegrityFailure,
  inspectPairQuestionnaireIntegrity,
  PairQuestionnaireIntegrityFailure,
} from './lib/pair-questionnaire-integrity';

const mongodbUri = process.env.MONGODB_URI?.trim();

const applyIndexes = process.argv.includes('--apply-additive-indexes');

const main = async (): Promise<void> => {
  if (!mongodbUri) {
    throw new PairQuestionnaireIntegrityFailure('MONGODB_URI_REQUIRED');
  }

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
      report.duplicateAnswerGroups > 0
    ) {
      throw new PairQuestionnaireIntegrityFailure('DUPLICATE_SOURCE_ROWS');
    }
    if (report.conflictingCanonicalIndexes.length > 0) {
      throw new PairQuestionnaireIntegrityFailure(
        'CONFLICTING_CANONICAL_INDEX'
      );
    }
    if (!applyIndexes && report.missingCanonicalIndexes.length > 0) {
      throw new PairQuestionnaireIntegrityFailure('MISSING_CANONICAL_INDEX');
    }
  } finally {
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(JSON.stringify(formatPairQuestionnaireIntegrityFailure(error)));
  process.exitCode = 1;
});
