import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { DomainError } from '@/domain/errors';
import { questionnaireTransition } from '@/domain/state/questionnaireMachine';
import { PairQuestionnaireAnswer } from '@/models/PairQuestionnaireAnswer';
import { PairQuestionnaireSession } from '@/models/PairQuestionnaireSession';
import {
  ACTIVE_SESSION_INDEX_NAME,
  ANSWER_IDENTITY_INDEX_NAME,
  formatPairQuestionnaireIntegrityFailure,
  PAIR_QUESTIONNAIRE_INTEGRITY_VERSION,
  PairQuestionnaireIntegrityFailure,
} from './lib/pair-questionnaire-integrity';

type EnumSchemaType = mongoose.SchemaType & {
  options: { enum?: string[] };
};

const statusPath = PairQuestionnaireSession.schema.path(
  'status'
) as EnumSchemaType;
assert.deepEqual(statusPath.options.enum, [
  'in_progress',
  'completed',
  'closed',
]);

const sessionIndex = PairQuestionnaireSession.schema
  .indexes()
  .find(([, options]) => options.name === ACTIVE_SESSION_INDEX_NAME);
assert.ok(sessionIndex);
assert.deepEqual(sessionIndex[0], { pairId: 1, questionnaireId: 1 });
assert.equal(sessionIndex[1].unique, true);
assert.deepEqual(sessionIndex[1].partialFilterExpression, {
  status: 'in_progress',
});

const answerIndex = PairQuestionnaireAnswer.schema
  .indexes()
  .find(([, options]) => options.name === ANSWER_IDENTITY_INDEX_NAME);
assert.ok(answerIndex);
assert.deepEqual(answerIndex[0], { sessionId: 1, questionId: 1, by: 1 });
assert.equal(answerIndex[1].unique, true);

for (const action of [
  { type: 'START' as const, at: new Date('2026-08-11T00:00:00.000Z') },
  { type: 'ANSWER' as const, at: new Date('2026-08-11T00:00:00.000Z') },
  { type: 'COMPLETE' as const, at: new Date('2026-08-11T00:00:00.000Z') },
]) {
  assert.throws(
    () =>
      questionnaireTransition(
        {
          status: 'closed',
          startedAt: new Date('2026-08-10T00:00:00.000Z'),
          finishedAt: new Date('2026-08-11T00:00:00.000Z'),
        },
        action,
        { currentUserId: 'member-a', role: 'A' }
      ),
    (error: Error) => error instanceof DomainError && error.status === 409
  );
}

assert.equal(
  PAIR_QUESTIONNAIRE_INTEGRITY_VERSION,
  'pair-questionnaire-integrity-v1'
);

const sentinelPairId = 'pair-id-that-must-not-appear';
const unsafeMongoError = new Error(
  `E11000 duplicate key { pairId: ${sentinelPairId}, questionnaireId: private-questionnaire }`
);
const safeUnknownFailure = JSON.stringify(
  formatPairQuestionnaireIntegrityFailure(unsafeMongoError)
);
assert.equal(
  safeUnknownFailure,
  '{"migrationVersion":"pair-questionnaire-integrity-v1","ok":false,"reasonCode":"MONGO_COMMAND_FAILED"}'
);
assert.equal(safeUnknownFailure.includes(sentinelPairId), false);
assert.equal(safeUnknownFailure.includes('private-questionnaire'), false);
assert.equal(safeUnknownFailure.includes('dup key'), false);

assert.deepEqual(
  formatPairQuestionnaireIntegrityFailure(
    new PairQuestionnaireIntegrityFailure('DUPLICATE_SOURCE_ROWS')
  ),
  {
    migrationVersion: PAIR_QUESTIONNAIRE_INTEGRITY_VERSION,
    ok: false,
    reasonCode: 'DUPLICATE_SOURCE_ROWS',
  }
);

console.log('pair questionnaire integrity selfcheck: passed');
