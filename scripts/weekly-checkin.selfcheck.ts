import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import {
  currentWeekKey,
  summarizePairWeeklyCheckIns,
  toPairWeeklyCheckInPairDTO,
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

const partialPairDTO = toPairWeeklyCheckInPairDTO(partialSummary);
assert.equal(partialPairDTO.pair.dataStatus, 'PARTIAL');
assert.equal(partialPairDTO.pair.signals.length, 0);
assert.equal('readiness' in partialPairDTO.currentUser, false);
assert.equal('fatigue' in partialPairDTO.peer, false);

const secondOnlySummary = summarizePairWeeklyCheckIns({
  pairId: partialSummary.pairId,
  weekKey: partialSummary.weekKey,
  currentUserId: 'user-a',
  members: ['user-a', 'user-b'],
  checkIns: [
    {
      ...firstCheckIn,
      _id: new Types.ObjectId(),
      userId: 'user-b',
    },
  ],
});
const secondOnlyPairDTO = toPairWeeklyCheckInPairDTO(secondOnlySummary);
assert.equal(secondOnlyPairDTO.currentUser.submitted, false);
assert.equal(secondOnlyPairDTO.peer.submitted, true);
assert.equal(secondOnlyPairDTO.pair.dataStatus, 'PARTIAL');
assert.equal(secondOnlyPairDTO.pair.signals.length, 0);

const equalSummary = summarizePairWeeklyCheckIns({
  pairId: partialSummary.pairId,
  weekKey: partialSummary.weekKey,
  currentUserId: 'user-a',
  members: ['user-a', 'user-b'],
  checkIns: [
    firstCheckIn,
    {
      ...firstCheckIn,
      _id: new Types.ObjectId(),
      userId: 'user-b',
      updatedAt: new Date('2026-06-05T11:00:00.000Z'),
    },
  ],
});
const equalPairDTO = toPairWeeklyCheckInPairDTO(equalSummary);
assert.equal(equalPairDTO.pair.dataStatus, 'ENOUGH');
assert.equal(equalPairDTO.pair.signals.length, 4);
assert.equal(
  equalPairDTO.pair.signals.some((signal) => signal.status === 'MIXED'),
  false
);

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

const divergentPairDTO = toPairWeeklyCheckInPairDTO(divergentSummary);
assert.equal(divergentPairDTO.pair.dataStatus, 'ENOUGH');
assert.equal(
  divergentPairDTO.pair.signals.every((signal) => signal.status === 'MIXED'),
  true
);
const divergentPeerVariant = summarizePairWeeklyCheckIns({
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
        closeness: 0.2,
        fatigue: 0.1,
        irritation: 0.8,
        readiness: 0.9,
        unresolvedTopic: true,
        note: 'another private note',
      },
      updatedAt: new Date('2026-06-05T11:00:00.000Z'),
    },
  ],
});
assert.deepEqual(
  toPairWeeklyCheckInPairDTO(divergentPeerVariant).pair.signals,
  divergentPairDTO.pair.signals,
  'different peer values must collapse to the same qualitative projection'
);
const publicJson = JSON.stringify(divergentPairDTO);
for (const sensitiveField of [
  'answers',
  'note',
  'unresolvedTopic',
  'submittedCount',
  'divergence',
  'readiness',
  'fatigue',
  'closeness',
  'irritation',
]) {
  assert.equal(publicJson.includes(`"${sensitiveField}"`), false);
}

const insufficientPairDTO = toPairWeeklyCheckInPairDTO({
  ...divergentSummary,
  pair: {
    ...divergentSummary.pair,
    readiness: undefined,
  },
});
assert.equal(insufficientPairDTO.pair.dataStatus, 'INSUFFICIENT');
assert.equal(insufficientPairDTO.pair.signals.length, 0);

const service = readFileSync(
  join(process.cwd(), 'src/domain/services/weeklyCheckIn.service.ts'),
  'utf8'
);
assert.ok(service.includes("source: 'weekly_checkin'"));
assert.ok(service.includes("layer: 'state'"));
assert.ok(service.includes("'vectors.psyche.state.level'") || service.includes('vectors.${axis}.state.level'));
assert.ok(!service.includes("vectors.psyche.trait.level"));
assert.ok(!service.includes("vectors.communication.trait.level"));
assert.ok(service.includes('VectorSnapshot.insertMany(snapshots, { session })'));
assert.ok(service.includes('requirePairMember'));
assert.ok(service.includes('pairIdentityFilter'));
assert.ok(service.includes('buildPairWeeklyCheckInSummary'));
assert.ok(service.includes('toPairWeeklyCheckInPairDTO'));
assert.ok(service.includes('WeeklyCheckIn.create'));
assert.ok(service.includes('isDuplicateKeyError'));
assert.ok(service.includes('reconcileWeeklyCheckIn'));
assert.ok(service.includes('runWeeklyCheckInFinalization'));
assert.ok(service.includes("'finalization.state': 'effects_applied'"));
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
assert.ok(summaryRoute.includes('toPairWeeklyCheckInPairDTO'));

const pairDashboard = readFileSync(
  join(process.cwd(), 'src/domain/services/pairDashboardSummary.service.ts'),
  'utf8'
);
assert.ok(pairDashboard.includes('includeMetrics: false'));

const pairMeRoute = readFileSync(
  join(process.cwd(), 'src/app/api/pairs/me/route.ts'),
  'utf8'
);
assert.ok(pairMeRoute.includes('includeMetrics: false'));

const pairPanel = readFileSync(
  join(process.cwd(), 'src/components/checkins/PairWeeklyCheckInPanel.tsx'),
  'utf8'
);
assert.equal(pairPanel.includes('summary.pair.divergence'), false);
assert.equal(pairPanel.includes('summary.pair.readiness'), false);
assert.equal(pairPanel.includes('summary.pair.fatigue'), false);

const pairProfile = readFileSync(
  join(process.cwd(), 'src/features/pair/PairProfilePageClient.tsx'),
  'utf8'
);
assert.equal(pairProfile.includes('data.pair.readiness?.score'), false);
assert.equal(pairProfile.includes('data.pair.fatigue?.score'), false);

const model = readFileSync(
  join(process.cwd(), 'src/models/WeeklyCheckIn.ts'),
  'utf8'
);
assert.ok(model.includes('{ userId: 1, pairId: 1, weekKey: 1 }, { unique: true }'));
assert.ok(model.includes('{ userId: 1, weekKey: 1 }'));
assert.ok(model.includes('weekly-checkin-finalization-v1'));

const migration = readFileSync(
  join(process.cwd(), 'scripts/migrate-weekly-checkins-pair-scope.ts'),
  'utf8'
);
assert.ok(migration.includes('collection.createIndex(pairScopedKey'));
assert.ok(migration.includes('collection.dropIndex(oldUniqueIndex.name)'));

console.log('weekly selfcheck passed');
