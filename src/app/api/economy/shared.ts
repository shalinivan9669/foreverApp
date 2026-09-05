import { NextRequest } from 'next/server';
import { asError, toDomainError } from '@/domain/errors';
import { requireSession } from '@/lib/auth/guards';
import { enforceRateLimit, type RateLimitPolicy } from '@/lib/abuse/rateLimit';
import { jsonError, jsonOk } from '@/lib/api/response';

const policy: RateLimitPolicy = {
  name: 'economy-owner', routeKey: '/api/economy/*', keying: 'user',
  windows: [{ name: '60/min', limit: 60, windowMs: 60_000 }],
};

export const requireEconomyOwner = async (req: NextRequest) => {
  const auth = await requireSession(req);
  if (!auth.ok) return auth;
  const rate = await enforceRateLimit({ req, policy, userId: auth.data.userId });
  return rate.ok ? auth : rate;
};

export const economyResponse = async <T>(operation: () => Promise<T>) => {
  try {
    return jsonOk(await operation());
  } catch (error) {
    const domainError = toDomainError(asError(error));
    return jsonError(domainError.status, domainError.code, domainError.message);
  }
};
