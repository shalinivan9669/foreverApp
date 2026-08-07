import { Types, type HydratedDocument, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import { DomainError } from '@/domain/errors';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import {
  PairStateSnapshot,
  type PairStateSnapshotType,
} from '@/models/PairStateSnapshot';
import { WeeklyCycle } from '@/models/WeeklyCycle';
import type { PairType } from '@/models/Pair';
import { connectToDatabase } from '@/lib/mongodb';

const DEFAULT_LIMIT = 12;
export const PAIR_HISTORY_MAX_LIMIT = 20;

export type PairHistoryActivityStatus = Extract<
  PairActivityType['status'],
  'completed_success' | 'completed_partial' | 'failed' | 'cancelled' | 'expired'
>;

const HISTORY_ACTIVITY_STATUSES: PairHistoryActivityStatus[] = [
  'completed_success',
  'completed_partial',
  'failed',
  'cancelled',
  'expired',
];

export type PairHistorySignalDTO = {
  key: 'connection' | 'tension' | 'recovery' | 'resource';
  status: 'LOW' | 'STEADY' | 'HIGH' | 'MIXED';
};

export type PairHistoryCycleItemDTO = {
  kind: 'cycle';
  id: string;
  date: string;
  cycleKey: string;
  status: 'partial' | 'complete' | 'insufficient';
  summary: {
    dataStatus: 'PARTIAL' | 'ENOUGH' | 'INSUFFICIENT';
    signals: PairHistorySignalDTO[];
  };
};

export type PairHistoryActivityItemDTO = {
  kind: 'activity';
  id: string;
  date: string;
  title: string;
  status: PairHistoryActivityStatus;
  feedbackSubmitted: boolean;
};

export type PairHistoryItemDTO =
  | PairHistoryCycleItemDTO
  | PairHistoryActivityItemDTO;

export type PairHistoryPageDTO = {
  pairId: string;
  items: PairHistoryItemDTO[];
  nextCursor: string | null;
};

type HistoryKind = PairHistoryItemDTO['kind'];

type PairHistoryCursor = {
  v: 1;
  pairId: string;
  kind: HistoryKind;
  date: string;
  id: string;
};

type CanonicalWeeklyCycleAggregate = {
  cycleKey: string;
  occurredAt: Date;
  snapshot: Pick<PairStateSnapshotType, 'dataStatus' | 'signals'>;
};

type ActivityHistoryAggregate = {
  _id: Types.ObjectId;
  occurredAt: Date;
  title?: string | null;
  status: PairHistoryActivityStatus;
  feedbackSubmitted: boolean;
};

const cursorSchema = z.discriminatedUnion('kind', [
  z.object({
    v: z.literal(1),
    pairId: z.string().regex(/^[a-f\d]{24}$/i),
    kind: z.literal('cycle'),
    date: z.string().datetime(),
    id: z.string().min(1).max(100),
  }),
  z.object({
    v: z.literal(1),
    pairId: z.string().regex(/^[a-f\d]{24}$/i),
    kind: z.literal('activity'),
    date: z.string().datetime(),
    id: z.string().regex(/^[a-f\d]{24}$/i),
  }),
]);

const kindRank: Record<HistoryKind, number> = {
  cycle: 0,
  activity: 1,
};

const invalidCursor = (): DomainError =>
  new DomainError({
    code: 'INVALID_HISTORY_CURSOR',
    status: 400,
    message: 'Invalid history cursor',
  });

export const decodePairHistoryCursor = (
  encoded: string | undefined,
  pairId: string
): PairHistoryCursor | null => {
  if (!encoded) return null;
  if (encoded.length > 512) throw invalidCursor();

  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    );
    if (!parsed.success || parsed.data.pairId !== pairId) {
      throw invalidCursor();
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw invalidCursor();
  }
};

export const encodePairHistoryCursor = (
  pairId: string,
  item: PairHistoryItemDTO
): string => {
  const payload: PairHistoryCursor = {
    v: 1,
    pairId,
    kind: item.kind,
    date: item.date,
    id: item.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

const compareHistoryItems = (
  left: PairHistoryItemDTO,
  right: PairHistoryItemDTO
): number => {
  const dateOrder = Date.parse(right.date) - Date.parse(left.date);
  if (dateOrder !== 0) return dateOrder;

  const kindOrder = kindRank[left.kind] - kindRank[right.kind];
  if (kindOrder !== 0) return kindOrder;

  return right.id.localeCompare(left.id);
};

const cursorMatch = (input: {
  cursor: PairHistoryCursor | null;
  sourceKind: HistoryKind;
  dateField: string;
  idField: string;
}): PipelineStage.Match['$match'] => {
  const { cursor, sourceKind, dateField, idField } = input;
  if (!cursor) return {};

  const cursorDate = new Date(cursor.date);
  const sourceRank = kindRank[sourceKind];
  const cursorRank = kindRank[cursor.kind];

  if (sourceRank < cursorRank) {
    return { [dateField]: { $lt: cursorDate } };
  }
  if (sourceRank > cursorRank) {
    return { [dateField]: { $lte: cursorDate } };
  }

  const cursorId =
    sourceKind === 'activity' ? new Types.ObjectId(cursor.id) : cursor.id;
  return {
    $or: [
      { [dateField]: { $lt: cursorDate } },
      { [dateField]: cursorDate, [idField]: { $lt: cursorId } },
    ],
  };
};

const cycleStatusFor = (
  dataStatus: PairHistoryCycleItemDTO['summary']['dataStatus']
): PairHistoryCycleItemDTO['status'] =>
  dataStatus === 'ENOUGH'
    ? 'complete'
    : dataStatus === 'PARTIAL'
      ? 'partial'
      : 'insufficient';

export const projectCanonicalHistoryCycle = (
  cycle: CanonicalWeeklyCycleAggregate
): PairHistoryCycleItemDTO => {
  const dataStatus =
    cycle.snapshot.dataStatus === 'ENOUGH' ||
    cycle.snapshot.dataStatus === 'PARTIAL'
      ? cycle.snapshot.dataStatus
      : 'INSUFFICIENT';

  return {
    kind: 'cycle',
    id: cycle.cycleKey,
    date: cycle.occurredAt.toISOString(),
    cycleKey: cycle.cycleKey,
    status: cycleStatusFor(dataStatus),
    summary: {
      dataStatus,
      signals:
        dataStatus === 'ENOUGH'
          ? cycle.snapshot.signals
              .slice(0, 4)
              .map((signal) => ({
                key: signal.key,
                status: signal.status,
              }))
          : [],
    },
  };
};

const toActivityItem = (
  activity: ActivityHistoryAggregate
): PairHistoryActivityItemDTO => ({
  kind: 'activity',
  id: String(activity._id),
  date: activity.occurredAt.toISOString(),
  title: activity.title?.trim() || 'Активность',
  status: activity.status,
  feedbackSubmitted: activity.feedbackSubmitted,
});

export const pairHistoryService = {
  async list(input: {
    pair: HydratedDocument<PairType>;
    role: 'A' | 'B';
    cursor?: string;
    limit?: number;
    now?: Date;
  }): Promise<PairHistoryPageDTO> {
    await connectToDatabase();
    const now = input.now ?? new Date();
    await weeklyCycleService.finalizeExpiredCycles({ pair: input.pair, now });
    const pairId = String(input.pair._id);
    const pairObjectId = new Types.ObjectId(pairId);
    const currentMemberId = input.pair.members[input.role === 'A' ? 0 : 1];
    const cursor = decodePairHistoryCursor(input.cursor, pairId);
    const limit = Math.min(
      PAIR_HISTORY_MAX_LIMIT,
      Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT))
    );
    const sourceLimit = limit + 1;

    const [canonicalCycles, activities] = await Promise.all([
      // Published cycles are projected only from their immutable canonical snapshot.
      WeeklyCycle.aggregate<CanonicalWeeklyCycleAggregate>([
        {
          $match: {
            pairId: pairObjectId,
            cycleKey: { $type: 'string' },
            startsAt: { $type: 'date' },
            endsAt: { $lte: now },
            latestSnapshotId: { $type: 'objectId' },
          },
        },
        {
          $project: {
            pairId: 1,
            cycleKey: 1,
            occurredAt: '$startsAt',
            latestSnapshotId: 1,
          },
        },
        {
          $lookup: {
            from: PairStateSnapshot.collection.name,
            let: {
              snapshotId: '$latestSnapshotId',
              cycleId: '$_id',
              pairId: '$pairId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$snapshotId'] },
                      { $eq: ['$cycleId', '$$cycleId'] },
                      { $eq: ['$pairId', '$$pairId'] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, dataStatus: 1, signals: 1 } },
            ],
            as: 'snapshots',
          },
        },
        { $unwind: '$snapshots' },
        {
          $project: {
            _id: 0,
            cycleKey: 1,
            occurredAt: 1,
            snapshot: '$snapshots',
          },
        },
        {
          $match: cursorMatch({
            cursor,
            sourceKind: 'cycle',
            dateField: 'occurredAt',
            idField: 'cycleKey',
          }),
        },
        { $sort: { occurredAt: -1, cycleKey: -1 } },
        { $limit: sourceLimit },
      ]).exec(),
      PairActivity.aggregate<ActivityHistoryAggregate>([
        {
          $match: {
            pairId: pairObjectId,
            status: { $in: HISTORY_ACTIVITY_STATUSES },
            offeredAt: { $type: 'date' },
            $and: [
              {
                $or: [
                  { visibility: { $exists: false } },
                  { visibility: 'both' },
                  { visibility: input.role === 'A' ? 'privateA' : 'privateB' },
                ],
              },
              {
                $or: [
                  { 'stateMeta.assignedMemberIds': currentMemberId },
                  {
                    'stateMeta.assignedMemberIds': { $exists: false },
                    mode: {
                      $in: [
                        'together',
                        input.role === 'A' ? 'soloA' : 'soloB',
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          $project: {
            _id: 1,
            occurredAt: '$offeredAt',
            title: { $ifNull: ['$title.ru', '$title.en'] },
            status: 1,
            feedbackSubmitted: {
              $or: [
                { $gt: [{ $size: { $ifNull: ['$answers', []] } }, 0] },
                {
                  $gt: [
                    { $ifNull: ['$resultSummary.submittedCount', 0] },
                    0,
                  ],
                },
              ],
            },
          },
        },
        {
          $match: cursorMatch({
            cursor,
            sourceKind: 'activity',
            dateField: 'occurredAt',
            idField: '_id',
          }),
        },
        { $sort: { occurredAt: -1, _id: -1 } },
        { $limit: sourceLimit },
      ]).exec(),
    ]);

    const items = [
      ...canonicalCycles.map(projectCanonicalHistoryCycle),
      ...activities.map(toActivityItem),
    ].sort(compareHistoryItems);
    const pageItems = items.slice(0, limit);
    const hasMore = items.length > limit;
    const lastItem = pageItems.at(-1);

    return {
      pairId,
      items: pageItems,
      nextCursor:
        hasMore && lastItem
          ? encodePairHistoryCursor(pairId, lastItem)
          : null,
    };
  },
};
