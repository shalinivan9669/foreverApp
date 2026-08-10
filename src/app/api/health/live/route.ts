import { jsonOk } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const response = jsonOk({ status: 'live' as const });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
