import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { jsonOk } from '@/lib/api/response';
import { parseQuery } from '@/lib/api/validate';
import { pairReadService } from '@/domain/services/pairRead.service';

// DTO rule: return only DTO/view model (never raw DB model shape).

export async function GET(req: NextRequest) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const userId = auth.data.userId;

  return jsonOk(await pairReadService.getCurrentForMember(userId));
}
