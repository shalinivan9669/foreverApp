import { NextRequest } from 'next/server';
import { z } from 'zod';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';

export async function GET(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  await connectToDatabase();

  const pair = await Pair.findOne({
    members: userId,
    status: 'active',
  }).lean();

  if (!pair) return jsonOk({ hasActive: false });

  const peerId = pair.members.find(m => m !== userId)!;
  const peer = await User.findOne({ id: peerId })
    .select({ id: 1, username: 1, avatar: 1 })
    .lean<UserType | null>();

  return jsonOk({
    hasActive: true,
    pairKey: pair.key,
    peer: peer ? { id: peer.id, username: peer.username, avatar: peer.avatar } : { id: peerId, username: peerId, avatar: '' }
  });
}
