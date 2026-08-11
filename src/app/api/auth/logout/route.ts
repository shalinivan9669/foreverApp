import { NextRequest } from 'next/server';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { jsonOk } from '@/lib/api/response';
import { auditContextFromRequest, emitEvent } from '@/lib/audit/emitEvent';
import { requireSession } from '@/lib/auth/guards';

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  await sessionRevocationService.revokeAll(auth.data.userId);
  await emitEvent({
    event: 'SESSION_REVOKED',
    actor: { userId: auth.data.userId },
    request: auditContextFromRequest(req, '/api/auth/logout'),
    target: { type: 'session', id: auth.data.userId },
    metadata: { scope: 'ALL' },
  });

  const response = jsonOk({ revoked: true });
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const secure =
    process.env.NODE_ENV === 'production' ||
    forwardedProto === 'https' ||
    new URL(req.url).protocol === 'https:';
  response.cookies.set({
    name: 'session',
    value: '',
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
