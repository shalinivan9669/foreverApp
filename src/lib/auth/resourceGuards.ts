import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { jsonNotFound } from '@/lib/auth/errors';
import { Pair, type PairType } from '@/models/Pair';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { Like, type LikeType } from '@/models/Like';

export type ResourceGuardResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

type PairDoc = HydratedDocument<PairType>;
type ActivityDoc = HydratedDocument<PairActivityType>;
type LikeDoc = HydratedDocument<LikeType>;

const isObjectId = (id: string) => Types.ObjectId.isValid(id);
const NON_RESOURCE_OBJECT_ID = new Types.ObjectId('000000000000000000000000');

const guardedObjectId = (id: string): Types.ObjectId =>
  isObjectId(id) ? new Types.ObjectId(id) : NON_RESOURCE_OBJECT_ID;

export const requirePairMember = async (
  pairId: string,
  currentUserId: string
): Promise<ResourceGuardResult<{ pair: PairDoc; by: 'A' | 'B' }>> => {
  await connectToDatabase();

  const pair = await Pair.findOne({
    _id: guardedObjectId(pairId),
    members: currentUserId,
    status: { $in: ['active', 'paused'] },
  });
  if (!isObjectId(pairId) || !pair) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'pair not found') };
  }

  const by: 'A' | 'B' | null =
    pair.members[0] === currentUserId
      ? 'A'
      : pair.members[1] === currentUserId
        ? 'B'
        : null;

  if (!by) return { ok: false, response: jsonNotFound('NOT_FOUND', 'pair not found') };

  return { ok: true, data: { pair, by } };
};

export const requireActivePairForMember = async (
  currentUserId: string
): Promise<ResourceGuardResult<{ pair: PairDoc; by: 'A' | 'B' }>> => {
  await connectToDatabase();

  const pair = await Pair.findOne({
    members: currentUserId,
    status: 'active',
  });
  if (!pair) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'pair not found') };
  }

  const by: 'A' | 'B' = pair.members[0] === currentUserId ? 'A' : 'B';
  return { ok: true, data: { pair, by } };
};

export const requireActivityMember = async (
  activityId: string,
  currentUserId: string
): Promise<ResourceGuardResult<{ activity: ActivityDoc; pair: PairDoc; by: 'A' | 'B' }>> => {
  await connectToDatabase();

  const validActivityId = isObjectId(activityId);
  const activity = await PairActivity.findById(guardedObjectId(activityId));
  const pair = await Pair.findOne({
    _id: activity?.pairId ?? NON_RESOURCE_OBJECT_ID,
    members: currentUserId,
    status: { $in: ['active', 'paused'] },
  });
  if (!validActivityId || !activity || !pair) {
    return {
      ok: false,
      response: jsonNotFound('NOT_FOUND', 'activity not found'),
    };
  }

  const by: 'A' | 'B' | null =
    pair.members[0] === currentUserId
      ? 'A'
      : pair.members[1] === currentUserId
        ? 'B'
        : null;
  if (!by) {
    return {
      ok: false,
      response: jsonNotFound('NOT_FOUND', 'activity not found'),
    };
  }

  return {
    ok: true,
    data: {
      activity,
      pair,
      by,
    },
  };
};

export const requireLikeParticipant = async (
  likeId: string,
  currentUserId: string
): Promise<ResourceGuardResult<{ like: LikeDoc; role: 'from' | 'to' }>> => {
  await connectToDatabase();

  const like = await Like.findOne({
    _id: guardedObjectId(likeId),
    $or: [{ fromId: currentUserId }, { toId: currentUserId }],
  });
  if (!isObjectId(likeId) || !like) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'like not found') };
  }

  if (like.fromId === currentUserId) {
    return { ok: true, data: { like, role: 'from' } };
  }

  if (like.toId === currentUserId) {
    return { ok: true, data: { like, role: 'to' } };
  }
  return { ok: false, response: jsonNotFound('NOT_FOUND', 'like not found') };
};
