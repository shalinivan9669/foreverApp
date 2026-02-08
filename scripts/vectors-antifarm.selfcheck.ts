import assert from 'node:assert/strict';
import {
  evaluatePersonalQuestionnaireCooldown,
  PERSONAL_BULK_COOLDOWN_KEY,
} from '@/domain/vectors';

const run = () => {
  const baseNow = new Date('2026-02-08T10:00:00.000Z');

  const first = evaluatePersonalQuestionnaireCooldown({
    questionnaireId: 'q-personal-1',
    vectorsMeta: {},
    now: baseNow,
    cooldownDays: 7,
  });

  assert.equal(first.applied, true, 'First submit should be applied');
  assert.equal(first.reason, 'APPLIED', 'First submit should have APPLIED reason');

  const second = evaluatePersonalQuestionnaireCooldown({
    questionnaireId: 'q-personal-1',
    vectorsMeta: {
      personalQuestionnaireCooldowns: {
        'q-personal-1': first.appliedAt,
      },
    },
    now: new Date('2026-02-09T10:00:00.000Z'),
    cooldownDays: 7,
  });

  assert.equal(second.applied, false, 'Immediate repeat should be blocked by cooldown');
  assert.equal(second.reason, 'COOLDOWN', 'Immediate repeat should return COOLDOWN');

  const third = evaluatePersonalQuestionnaireCooldown({
    questionnaireId: 'q-personal-1',
    vectorsMeta: {
      personalQuestionnaireCooldowns: {
        'q-personal-1': first.appliedAt,
      },
    },
    now: new Date('2026-02-16T10:00:00.000Z'),
    cooldownDays: 7,
  });

  assert.equal(third.applied, true, 'Submit after cooldown window should be applied');
  assert.equal(third.reason, 'APPLIED', 'Submit after cooldown should reset to APPLIED');

  const bulk = evaluatePersonalQuestionnaireCooldown({
    vectorsMeta: {},
    now: baseNow,
    cooldownDays: 7,
  });

  assert.equal(
    bulk.questionnaireKey,
    PERSONAL_BULK_COOLDOWN_KEY,
    'Ad-hoc bulk submit should use bulk cooldown key'
  );

  console.log('Vector anti-farm cooldown self-check passed.');
};

run();
