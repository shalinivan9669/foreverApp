import mongoose, { Schema, Types } from 'mongoose';
import type {
  WeeklyCycleMemberCompletion,
  WeeklyCyclePairReadiness,
} from '@/models/WeeklyCycle';

export type PairStateSignalKey =
  | 'connection'
  | 'tension'
  | 'recovery'
  | 'resource';

export type PairStateSignalStatus = 'LOW' | 'STEADY' | 'HIGH' | 'MIXED';

export type PairStateSignal = {
  key: PairStateSignalKey;
  status: PairStateSignalStatus;
  reasonCode:
    | 'PAIR_LEVEL_LOW'
    | 'PAIR_LEVEL_STEADY'
    | 'PAIR_LEVEL_HIGH'
    | 'DIFFERENT_EXPERIENCE';
  nextStepHint:
    | 'CHECK_IN_TOGETHER'
    | 'CHOOSE_LOW_EFFORT'
    | 'MAKE_ROOM_FOR_RECOVERY'
    | 'KEEP_CURRENT_RHYTHM';
};

export type PairStateReasonCode =
  | 'NO_MEMBER_SUBMISSIONS'
  | 'PAIR_INPUT_PARTIAL'
  | 'PAIR_SIGNALS_READY'
  | 'PAIR_INPUT_INSUFFICIENT'
  | 'CYCLE_EXPIRED';

export interface PairStateSnapshotType {
  pairId: Types.ObjectId;
  cycleId: Types.ObjectId;
  cycleKey: string;
  revision: number;
  memberCompletion: WeeklyCycleMemberCompletion[];
  dataStatus: WeeklyCyclePairReadiness;
  reasonCodes: PairStateReasonCode[];
  signals: PairStateSignal[];
  input: {
    definitionVersion: string;
    evidenceRevisionIds: string[];
    hash: string;
    cycleStatus: 'OPEN' | 'EXPIRED';
  };
  algorithm: {
    version: string;
  };
  displayVersion: string;
  generatedAt: Date;
}

const memberCompletionSchema = new Schema<WeeklyCycleMemberCompletion>(
  {
    userId: { type: String, required: true, immutable: true },
    status: {
      type: String,
      enum: ['PENDING', 'SUBMITTED', 'SKIPPED', 'EXPIRED'],
      required: true,
      immutable: true,
    },
  },
  { _id: false }
);

const signalSchema = new Schema<PairStateSignal>(
  {
    key: {
      type: String,
      enum: ['connection', 'tension', 'recovery', 'resource'],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: ['LOW', 'STEADY', 'HIGH', 'MIXED'],
      required: true,
      immutable: true,
    },
    reasonCode: {
      type: String,
      enum: [
        'PAIR_LEVEL_LOW',
        'PAIR_LEVEL_STEADY',
        'PAIR_LEVEL_HIGH',
        'DIFFERENT_EXPERIENCE',
      ],
      required: true,
      immutable: true,
    },
    nextStepHint: {
      type: String,
      enum: [
        'CHECK_IN_TOGETHER',
        'CHOOSE_LOW_EFFORT',
        'MAKE_ROOM_FOR_RECOVERY',
        'KEEP_CURRENT_RHYTHM',
      ],
      required: true,
      immutable: true,
    },
  },
  { _id: false }
);

const inputSchema = new Schema<PairStateSnapshotType['input']>(
  {
    definitionVersion: { type: String, required: true, immutable: true },
    evidenceRevisionIds: {
      type: [String],
      required: true,
      immutable: true,
    },
    hash: { type: String, required: true, immutable: true },
    cycleStatus: {
      type: String,
      enum: ['OPEN', 'EXPIRED'],
      required: true,
      immutable: true,
    },
  },
  { _id: false }
);

const algorithmSchema = new Schema<PairStateSnapshotType['algorithm']>(
  {
    version: { type: String, required: true, immutable: true },
  },
  { _id: false }
);

const pairStateSnapshotSchema = new Schema<PairStateSnapshotType>(
  {
    pairId: {
      type: Schema.Types.ObjectId,
      ref: 'Pair',
      required: true,
      immutable: true,
    },
    cycleId: {
      type: Schema.Types.ObjectId,
      ref: 'WeeklyCycle',
      required: true,
      immutable: true,
    },
    cycleKey: { type: String, required: true, immutable: true },
    revision: { type: Number, required: true, min: 0, immutable: true },
    memberCompletion: {
      type: [memberCompletionSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (members: WeeklyCycleMemberCompletion[]) =>
          members.length === 2 && members[0].userId !== members[1].userId,
        message: 'Pair state snapshot must track two different pair members',
      },
    },
    dataStatus: {
      type: String,
      enum: ['NOT_READY', 'PARTIAL', 'ENOUGH', 'INSUFFICIENT', 'EXPIRED'],
      required: true,
      immutable: true,
    },
    reasonCodes: {
      type: [String],
      enum: [
        'NO_MEMBER_SUBMISSIONS',
        'PAIR_INPUT_PARTIAL',
        'PAIR_SIGNALS_READY',
        'PAIR_INPUT_INSUFFICIENT',
        'CYCLE_EXPIRED',
      ],
      required: true,
      immutable: true,
    },
    signals: {
      type: [signalSchema],
      required: true,
      immutable: true,
      validate: {
        validator: (signals: PairStateSignal[]) => signals.length <= 4,
        message: 'Pair state snapshot supports at most four safe signals',
      },
    },
    input: { type: inputSchema, required: true, immutable: true },
    algorithm: { type: algorithmSchema, required: true, immutable: true },
    displayVersion: { type: String, required: true, immutable: true },
    generatedAt: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
  },
  {
    collection: 'pair_state_snapshots',
    versionKey: false,
  }
);

pairStateSnapshotSchema.index({ cycleId: 1, revision: 1 }, { unique: true });
pairStateSnapshotSchema.index(
  { cycleId: 1, 'input.hash': 1, 'algorithm.version': 1 },
  { unique: true }
);
pairStateSnapshotSchema.index({ pairId: 1, cycleKey: 1, revision: -1 });

export const PairStateSnapshot =
  (mongoose.models.PairStateSnapshot as mongoose.Model<PairStateSnapshotType>) ||
  mongoose.model<PairStateSnapshotType>(
    'PairStateSnapshot',
    pairStateSnapshotSchema
  );
