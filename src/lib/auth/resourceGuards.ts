import { Types, type HydratedDocument } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { jsonForbidden, jsonNotFound } from '@/lib/auth/errors';
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

export const requirePairMember = async (
  pairId: string,
  currentUserId: string
): Promise<ResourceGuardResult<{ pair: PairDoc; by: 'A' | 'B' }>> => {
  await connectToDatabase();

  if (!isObjectId(pairId)) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'pair not found') };
  }

  const pair = await Pair.findById(pairId);
  if (!pair) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'pair not found') };
  }

  const by: 'A' | 'B' | null =
    pair.members[0] === currentUserId
      ? 'A'
      : pair.members[1] === currentUserId
        ? 'B'
        : null;

  if (!by) {
    return { ok: false, response: jsonForbidden('ACCESS_DENIED', 'forbidden') };
  }

  return { ok: true, data: { pair, by } };
};

export const requireActivityMember = async (
  activityId: string,
  currentUserId: string
): Promise<ResourceGuardResult<{ activity: ActivityDoc; pair: PairDoc; by: 'A' | 'B' }>> => {
  await connectToDatabase();

  if (!isObjectId(activityId)) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'activity not found') };
  }

  const activity = await PairActivity.findById(activityId);
  if (!activity) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'activity not found') };
  }

  const pairGuard = await requirePairMember(String(activity.pairId), currentUserId);
  if (!pairGuard.ok) {
    return pairGuard;
  }

  return {
    ok: true,
    data: {
      activity,
      pair: pairGuard.data.pair,
      by: pairGuard.data.by,
    },
  };
};

export const requireLikeParticipant = async (
  likeId: string,
  currentUserId: string
): Promise<ResourceGuardResult<{ like: LikeDoc; role: 'from' | 'to' }>> => {
  await connectToDatabase();

  if (!isObjectId(likeId)) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'like not found') };
  }

  const like = await Like.findById(likeId);
  if (!like) {
    return { ok: false, response: jsonNotFound('NOT_FOUND', 'like not found') };
  }

  if (like.fromId === currentUserId) {
    return { ok: true, data: { like, role: 'from' } };
  }

  if (like.toId === currentUserId) {
    return { ok: true, data: { like, role: 'to' } };
  }

  return { ok: false, response: jsonForbidden('ACCESS_DENIED', 'forbidden') };
};
