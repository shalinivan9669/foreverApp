import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { domainResponse } from '@/lib/api/domainResponse';
import { measurementTestsService } from '@/domain/services/measurementTests.service';
export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  return domainResponse(() => measurementTestsService.list(auth.data.userId));
}
