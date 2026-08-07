import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DomainError } from '../src/domain/errors';
import {
  decodePairHistoryCursor,
  encodePairHistoryCursor,
  PAIR_HISTORY_MAX_LIMIT,
  projectCanonicalHistoryCycle,
  type PairHistoryCycleItemDTO,
} from '../src/domain/services/pairHistory.service';

const root = process.cwd();
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

const pairId = '64b000000000000000000001';
const otherPairId = '64b000000000000000000002';
const cycleItem: PairHistoryCycleItemDTO = {
  kind: 'cycle',
  id: '2026-W32',
  date: '2026-08-07T10:00:00.000Z',
  cycleKey: '2026-W32',
  status: 'complete',
  summary: {
    dataStatus: 'ENOUGH',
    signals: [{ key: 'connection', status: 'STEADY' }],
  },
};

const cursor = encodePairHistoryCursor(pairId, cycleItem);
assert.deepEqual(decodePairHistoryCursor(cursor, pairId), {
  v: 1,
  pairId,
  kind: 'cycle',
  date: cycleItem.date,
  id: cycleItem.id,
});
assert.throws(
  () => decodePairHistoryCursor(cursor, otherPairId),
  (error) => error instanceof DomainError && error.code === 'INVALID_HISTORY_CURSOR'
);
assert.throws(
  () => decodePairHistoryCursor('not-a-cursor', pairId),
  (error) => error instanceof DomainError && error.status === 400
);
assert.equal(PAIR_HISTORY_MAX_LIMIT, 20);

const canonicalProjection = projectCanonicalHistoryCycle({
  cycleKey: cycleItem.cycleKey,
  occurredAt: new Date(cycleItem.date),
  snapshot: {
    dataStatus: 'ENOUGH',
    signals: [
      {
        key: 'connection',
        status: 'STEADY',
        reasonCode: 'PAIR_LEVEL_STEADY',
        nextStepHint: 'KEEP_CURRENT_RHYTHM',
      },
    ],
  },
});
assert.deepEqual(canonicalProjection, cycleItem);
assert.deepEqual(
  projectCanonicalHistoryCycle({
    cycleKey: '2026-W31',
    occurredAt: new Date('2026-07-31T10:00:00.000Z'),
    snapshot: {
      dataStatus: 'PARTIAL',
      signals: [
        {
          key: 'resource',
          status: 'HIGH',
          reasonCode: 'PAIR_LEVEL_HIGH',
          nextStepHint: 'KEEP_CURRENT_RHYTHM',
        },
      ],
    },
  }).summary.signals,
  [],
  'non-ready snapshots must not publish signals'
);

const route = read('src/app/api/pairs/[id]/history/route.ts');
assert.match(route, /requireSession\(req\)/);
assert.match(route, /requirePairMember\(params\.data\.id, auth\.data\.userId\)/);
assert.match(route, /pairHistoryService\.list/);
assert.match(route, /private, no-store/);
assert.match(route, /max\(PAIR_HISTORY_MAX_LIMIT\)/);
assert.doesNotMatch(route, /@\/models\//);

const service = read('src/domain/services/pairHistory.service.ts');
assert.match(service, /HISTORY_ACTIVITY_STATUSES/);
assert.match(service, /visibility: input\.role === 'A' \? 'privateA' : 'privateB'/);
assert.match(service, /'stateMeta\.assignedMemberIds': currentMemberId/);
assert.match(service, /input\.role === 'A' \? 'soloA' : 'soloB'/);
assert.match(service, /feedbackSubmitted/);
assert.match(service, /sourceLimit = limit \+ 1/);
assert.match(service, /latestSnapshotId/);
assert.match(service, /PairStateSnapshot\.collection\.name/);
assert.match(service, /WeeklyCycle\.aggregate/);
assert.match(service, /weeklyCycleService\.finalizeExpiredCycles/);
assert.match(service, /endsAt: \{ \$lte: now \}/);
assert.doesNotMatch(service, /@\/models\/RecommendationDecision/);
assert.doesNotMatch(service, /WeeklyCheckIn|weeklyCheckIn\.service/);
assert.doesNotMatch(
  service,
  /summarizePairWeeklyCheckIns|toPairWeeklyCheckInPairDTO|buildPairStateProjection/
);

const canonicalMapperStart = service.indexOf(
  'export const projectCanonicalHistoryCycle'
);
const activityMapperStart = service.indexOf('const toActivityItem');
assert.ok(canonicalMapperStart >= 0 && activityMapperStart > canonicalMapperStart);
const canonicalMapper = service.slice(canonicalMapperStart, activityMapperStart);
assert.match(canonicalMapper, /cycle\.snapshot\.dataStatus/);
assert.match(canonicalMapper, /cycle\.snapshot\.signals/);
assert.doesNotMatch(
  canonicalMapper,
  /summarizePairWeeklyCheckIns|toPairWeeklyCheckInPairDTO|buildPairStateProjection/
);

const snapshotModel = read('src/models/PairStateSnapshot.ts');
assert.match(snapshotModel, /immutable: true/);
assert.doesNotMatch(snapshotModel, /answers|note/);

const dtoStart = service.indexOf('export type PairHistorySignalDTO');
const dtoEnd = service.indexOf('type HistoryKind');
assert.ok(dtoStart >= 0 && dtoEnd > dtoStart);
const publicDto = service.slice(dtoStart, dtoEnd);
for (const forbiddenField of [
  'answers',
  'note',
  'successScore',
  'matchScore',
  'vectors',
  'submittedCount',
  'usefulnessAvg',
  'comfortAvg',
  'tensionAvg',
  'wantsSimilarRatio',
]) {
  assert.doesNotMatch(publicDto, new RegExp(`\\b${forbiddenField}\\b`));
}

const client = read('src/client/api/pairHistory.api.ts');
assert.match(client, /PairHistoryPageDTO/);
assert.match(client, /feedbackSubmitted: boolean/);
assert.match(client, /cache: 'no-store'/);
for (const forbiddenField of [
  'answers',
  'note',
  'successScore',
  'matchScore',
  'vectors',
  'submittedCount',
]) {
  assert.doesNotMatch(client, new RegExp(`\\b${forbiddenField}\\b`));
}

const page = read('src/app/profile/(tabs)/history/page.tsx');
assert.match(page, /pairHistoryApi\.list/);
assert.match(page, /item\.summary\.signals/);
assert.match(page, /item\.feedbackSubmitted/);
assert.doesNotMatch(page, /localStorage|sessionStorage/);

console.log('pair history selfcheck passed');
