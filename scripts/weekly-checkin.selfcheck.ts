import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  currentWeekKey,
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

const route = readFileSync(
  join(process.cwd(), 'src/app/api/checkins/weekly/route.ts'),
  'utf8'
);
assert.ok(route.includes('requireSession(req)'));
assert.ok(route.includes('withIdempotency'));
assert.ok(!route.includes('body.userId'));

console.log('weekly selfcheck passed');
