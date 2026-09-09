import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { domainResponse } from '@/lib/api/domainResponse';
import { readMeasuredPairProfile } from '@/domain/services/measuredPairProfile.service';
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  return domainResponse(() => readMeasuredPairProfile(auth.data.userId, id));
}
