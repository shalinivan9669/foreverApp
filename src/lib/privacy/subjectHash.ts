import { createHmac } from 'crypto';

export const privacySubjectHash = (userId: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET_NOT_SET');
  return createHmac('sha256', secret).update(userId.trim()).digest('hex');
};
