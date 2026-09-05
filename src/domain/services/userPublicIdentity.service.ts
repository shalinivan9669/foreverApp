import { randomBytes } from 'node:crypto';
import { DomainError } from '@/domain/errors';
import { connectToDatabase } from '@/lib/mongodb';
import { User } from '@/models/User';

// Public pairing code is not a login credential or a provider identifier.
export const PUBLIC_PAIRING_ID_PATTERN = /^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
export const normalizePublicPairingId = (value: string): string => value.trim().toUpperCase();
export const generatePublicPairingId = (): string => {
  const value = randomBytes(12).toString('hex').toUpperCase();
  return `VM-${value.slice(0, 8)}-${value.slice(8, 16)}-${value.slice(16)}`;
};

export const ensurePublicPairingId = async (userId: string): Promise<string> => {
  await connectToDatabase();
  const existing = await User.findOne({ id: userId }).select({ publicId: 1 }).lean<{ publicId?: string } | null>();
  if (!existing) throw new DomainError({ code: 'USER_NOT_FOUND', status: 404, message: 'User not found' });
  if (existing.publicId) return existing.publicId;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const publicId = generatePublicPairingId();
    // Native update is limited to this immutable, server-generated field. The
    // predicate prevents simultaneous requests from replacing an assigned code.
    try {
      await User.collection.updateOne(
        { id: userId, publicId: { $exists: false } },
        { $set: { publicId } },
      );
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 11000)) throw error;
      continue;
    }
    const canonical = await User.findOne({ id: userId }).select({ publicId: 1 }).lean<{ publicId?: string } | null>();
    if (canonical?.publicId) return canonical.publicId;
  }
  throw new DomainError({ code: 'PUBLIC_ID_UNAVAILABLE', status: 503, message: 'Pairing code is temporarily unavailable' });
};
