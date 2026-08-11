import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair, type PairType } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { toPairDTO, type PairDTO } from '@/lib/dto/pair.dto';
import { toUserDTO, type PublicUserDTO } from '@/lib/dto/user.dto';

type PairDocument = PairType & { _id: Types.ObjectId };

export type CurrentPairReadModel = {
  pair: PairDTO | null;
  hasActive: boolean;
  hasAny: boolean;
  status: PairType['status'] | null;
};

export type ActivePairStatusReadModel =
  | { hasActive: false }
  | {
      hasActive: true;
      pairId: string;
      pairKey: string;
      peer: PublicUserDTO;
    };

export const pairReadService = {
  async getCurrentForMember(userId: string): Promise<CurrentPairReadModel> {
    await connectToDatabase();

    const pair = await Pair.findOne({
      members: userId,
      status: { $in: ['active', 'paused'] },
    })
      .sort({ createdAt: -1 })
      .lean<PairDocument | null>();
    const status = pair?.status ?? null;

    return {
      pair: pair ? toPairDTO(pair) : null,
      hasActive: status === 'active',
      hasAny: Boolean(pair),
      status,
    };
  },

  async getActiveStatusForMember(
    userId: string
  ): Promise<ActivePairStatusReadModel> {
    await connectToDatabase();

    const pair = await Pair.findOne({
      members: userId,
      status: 'active',
    }).lean<PairDocument | null>();
    if (!pair) return { hasActive: false };

    const peerId = pair.members.find((memberId) => memberId !== userId)!;
    const peer = await User.findOne({ id: peerId })
      .select({ id: 1, username: 1, avatar: 1 })
      .lean<UserType | null>();

    return {
      hasActive: true,
      pairId: String(pair._id),
      pairKey: pair.key,
      peer: peer
        ? toUserDTO(peer, { scope: 'public' })
        : { id: peerId, username: peerId, avatar: '' },
    };
  },
};
