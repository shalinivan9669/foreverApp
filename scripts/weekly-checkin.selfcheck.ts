import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import {
  currentWeekKey,
  summarizePairWeeklyCheckIns,
  validateWeeklyAnswers,
} from '@/domain/services/weeklyCheckIn.service';

const valid = validateWeeklyAnswers({
  closeness: 0.5,
  fatigue: 0.8,
  irritation: 0.7,
  readiness: 0.3,
  unresolvedTopic: true,
  note: 'short',
});
assert.equal(valid.fatigue, 0.8);
assert.equal(valid.unresolvedTopic, true);
assert.match(currentWeekKey(new Date('2026-06-04T00:00:00.000Z')), /^\d{4}-W\d{2}$/);
assert.throws(() =>
  validateWeeklyAnswers({
    closeness: 1.5,
    fatigue: 0,
    irritation: 0,
    readiness: 0,
    unresolvedTopic: false,
  })
);

const firstCheckIn = {
  _id: new Types.ObjectId(),
  userId: 'user-a',
  answers: {
    closeness: 0.7,
    fatigue: 0.8,
    irritation: 0.2,
    readiness: 0.4,
    unresolvedTopic: true,
    note: 'private note',
  },
  updatedAt: new Date('2026-06-05T10:00:00.000Z'),
};
const partialSummary = summarizePairWeeklyCheckIns({
  pairId: new Types.ObjectId().toString(),
  weekKey: '2026-W23',
  currentUserId: 'user-a',
  members: ['user-a', 'user-b'],
  checkIns: [firstCheckIn],
  peer: { id: 'user-b', username: 'Peer', avatar: '' },
});
assert.equal(partialSummary.currentUser.submitted, true);
assert.equal(partialSummary.peer.submitted, false);
assert.equal(partialSummary.pair.submittedCount, 1);
assert.equal(partialSummary.pair.status, 'partial');
assert.equal(partialSummary.pair.fatigue, 0.8);
assert.equal('note' in partialSummary.currentUser, false);
assert.equal('note' in partialSummary.peer, false);

const divergentSummary = summarizePairWeeklyCheckIns({
  pairId: partialSummary.pairId,
  weekKey: partialSummary.weekKey,
  currentUserId: 'user-a',
  members: ['user-a', 'user-b'],
  checkIns: [
    firstCheckIn,
    {
      _id: new Types.ObjectId(),
      userId: 'user-b',
      answers: {
        closeness: 0.3,
        fatigue: 0.2,
        irritation: 0.7,
        readiness: 0.8,
        unresolvedTopic: false,
      },
      updatedAt: new Date('2026-06-05T11:00:00.000Z'),
    },
  ],
});
assert.equal(divergentSummary.pair.submittedCount, 2);
assert.equal(divergentSummary.pair.bothSubmitted, true);
assert.equal(divergentSummary.pair.status, 'divergent');
assert.equal(divergentSummary.pair.hasDivergence, true);
assert.equal(divergentSummary.pair.fatigue, 0.5);

const service = readFileSync(
  join(process.cwd(), 'src/domain/services/weeklyCheckIn.service.ts'),
  'utf8'
);
assert.ok(service.includes("source: 'weekly_checkin'"));
assert.ok(service.includes("layer: 'state'"));
assert.ok(service.includes("'vectors.psyche.state.level'") || service.includes('vectors.${axis}.state.level'));
assert.ok(!service.includes("vectors.psyche.trait.level"));
assert.ok(!service.includes("vectors.communication.trait.level"));
assert.ok(service.includes('VectorSnapshot.insertMany(snapshots)'));
assert.ok(service.includes('requirePairMember'));
assert.ok(service.includes('pairIdentityFilter'));
assert.ok(service.includes('buildPairWeeklyCheckInSummary'));
assert.ok(!service.includes('oldPairReadiness'));
assert.ok(!service.includes('pairData.pair.readiness?.score ?? answers.readiness'));

const route = readFileSync(
  join(process.cwd(), 'src/app/api/checkins/weekly/route.ts'),
  'utf8'
);
assert.ok(route.includes('requireSession(req)'));
assert.ok(route.includes('withIdempotency'));
assert.ok(!route.includes('body.userId'));

const summaryRoute = readFileSync(
  join(process.cwd(), 'src/app/api/pairs/[id]/weekly-checkin/current/route.ts'),
  'utf8'
);
assert.ok(summaryRoute.includes('requireSession(req)'));
assert.ok(summaryRoute.includes('requirePairMember'));
assert.ok(summaryRoute.includes('buildPairWeeklyCheckInSummary'));

const model = readFileSync(
  join(process.cwd(), 'src/models/WeeklyCheckIn.ts'),
  'utf8'
);
assert.ok(model.includes('{ userId: 1, pairId: 1, weekKey: 1 }, { unique: true }'));
assert.ok(model.includes('{ userId: 1, weekKey: 1 }'));

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrate-weekly-checkins-pair-scope.ts'),
  'utf8'
);
assert.ok(migration.includes('collection.createIndex(pairScopedKey'));
assert.ok(migration.includes('collection.dropIndex(oldUniqueIndex.name)'));

console.log('weekly selfcheck passed');
