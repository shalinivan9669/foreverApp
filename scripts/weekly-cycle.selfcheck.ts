import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import {
  PAIR_STATE_ALGORITHM_VERSION,
  WEEKLY_CYCLE_INPUT_DEFINITION_VERSION,
  buildPairStateProjection,
  weeklyCycleKeyForDate,
  weeklyCycleWindow,
  type PairStateCheckInInput,
} from '@/domain/services/weeklyCycle.service';

const memberA = 'member-a';
const memberB = 'member-b';
const withinCycle = new Date('2026-06-04T12:00:00.000Z');
const cycleKey = weeklyCycleKeyForDate(withinCycle);
const window = weeklyCycleWindow(cycleKey);

assert.equal(cycleKey, '2026-W23');
assert.equal(window.startsAt.toISOString(), '2026-06-01T00:00:00.000Z');
assert.equal(window.endsAt.toISOString(), '2026-06-08T00:00:00.000Z');
assert.equal(WEEKLY_CYCLE_INPUT_DEFINITION_VERSION, 'weekly-checkin-v1');
assert.equal(PAIR_STATE_ALGORITHM_VERSION, 'pair-state-v1');

const first: PairStateCheckInInput = {
  _id: new Types.ObjectId(),
  userId: memberA,
  createdAt: new Date('2026-06-03T09:00:00.000Z'),
  answers: {
    closeness: 0.7,
    fatigue: 0.8,
    irritation: 0.2,
    readiness: 0.4,
  },
};
const second: PairStateCheckInInput = {
  _id: new Types.ObjectId(),
  userId: memberB,
  createdAt: new Date('2026-06-05T09:00:00.000Z'),
  answers: {
    closeness: 0.3,
    fatigue: 0.2,
    irritation: 0.7,
    readiness: 0.8,
  },
};

const empty = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(empty.dataStatus, 'NOT_READY');
assert.equal(empty.submissionCount, 0);
assert.equal(empty.signals.length, 0);

const firstPartial = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(firstPartial.dataStatus, 'PARTIAL');
assert.equal(firstPartial.submissionCount, 1);
assert.equal(firstPartial.signals.length, 0);
assert.equal(
  firstPartial.memberCompletion.find((member) => member.userId === memberA)?.status,
  'SUBMITTED'
);
assert.equal(
  firstPartial.memberCompletion.find((member) => member.userId === memberB)?.status,
  'PENDING'
);

const secondPartial = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [second],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(secondPartial.dataStatus, 'PARTIAL');
assert.equal(secondPartial.submissionCount, 1);
assert.equal(secondPartial.signals.length, 0);

const firstThenSecond = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first, second],
  endsAt: window.endsAt,
  now: withinCycle,
});
const secondThenFirst = buildPairStateProjection({
  cycleKey,
  members: [memberB, memberA],
  checkIns: [second, first],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(firstThenSecond.dataStatus, 'ENOUGH');
assert.equal(firstThenSecond.submissionCount, 2);
assert.equal(firstThenSecond.signals.length, 4);
assert.deepEqual(secondThenFirst, firstThenSecond);
assert.notEqual(
  firstPartial.inputHash,
  firstThenSecond.inputHash,
  'a late second immutable evidence revision must produce a new canonical input'
);

const insufficient = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [
    first,
    {
      ...second,
      answers: { ...second.answers, readiness: Number.NaN },
    },
  ],
  endsAt: window.endsAt,
  now: withinCycle,
});
assert.equal(insufficient.dataStatus, 'INSUFFICIENT');
assert.equal(insufficient.signals.length, 0);

const expired = buildPairStateProjection({
  cycleKey,
  members: [memberA, memberB],
  checkIns: [first, second],
  endsAt: window.endsAt,
  now: new Date('2026-06-08T00:00:00.000Z'),
});
assert.equal(expired.dataStatus, 'EXPIRED');
assert.equal(expired.signals.length, 0);
assert.notEqual(
  expired.inputHash,
  firstThenSecond.inputHash,
  'cycle expiry must produce a distinct immutable fallback revision'
);

const pairProjectionJson = JSON.stringify(firstThenSecond);
for (const forbiddenField of [
  'answers',
  'note',
  'closeness',
  'fatigue',
  'irritation',
  'readiness',
]) {
  assert.equal(pairProjectionJson.includes(`"${forbiddenField}"`), false);
}

const cycleModel = readFileSync(
  join(process.cwd(), 'src/models/WeeklyCycle.ts'),
  'utf8'
);
assert.ok(cycleModel.includes('{ pairId: 1, cycleKey: 1 }, { unique: true })'));
assert.ok(cycleModel.includes("'NOT_READY'"));
assert.ok(cycleModel.includes("'PARTIAL'"));
assert.ok(!cycleModel.includes('WAITING_A'));
assert.ok(!cycleModel.includes('WAITING_B'));

const snapshotModel = readFileSync(
  join(process.cwd(), 'src/models/PairStateSnapshot.ts'),
  'utf8'
);
assert.ok(snapshotModel.includes('{ cycleId: 1, revision: 1 }, { unique: true })'));
assert.ok(snapshotModel.includes("{ cycleId: 1, 'input.hash': 1, 'algorithm.version': 1 }"));
assert.ok(snapshotModel.includes('immutable: true'));
assert.equal(snapshotModel.includes('answers'), false);
assert.equal(snapshotModel.includes('note'), false);

const cycleService = readFileSync(
  join(process.cwd(), 'src/domain/services/weeklyCycle.service.ts'),
  'utf8'
);
assert.ok(cycleService.includes('PairStateSnapshot.create'));
assert.ok(cycleService.includes('isDuplicateKeyError'));
assert.ok(cycleService.includes('for (let attempt = 0; attempt < 5; attempt += 1)'));
assert.ok(cycleService.includes('submissionCount: { $lte: projection.submissionCount }'));
assert.equal(cycleService.includes('PairStateSnapshot.findOneAndUpdate'), false);

const weeklyService = readFileSync(
  join(process.cwd(), 'src/domain/services/weeklyCheckIn.service.ts'),
  'utf8'
);
assert.ok((weeklyService.match(/syncAfterCheckIn/g) ?? []).length >= 3);

const route = readFileSync(
  join(process.cwd(), 'src/app/api/pairs/[id]/weekly-cycle/current/route.ts'),
  'utf8'
);
assert.ok(route.includes('requireSession(req)'));
assert.ok(route.includes('requirePairMember'));
assert.ok(route.includes('weeklyCycleService.current'));

console.log('weekly-cycle selfcheck passed');
