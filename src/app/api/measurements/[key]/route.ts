import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { domainResponse } from '@/lib/api/domainResponse';
import { parseJson } from '@/lib/api/validate';
import { measurementTestsService } from '@/domain/services/measurementTests.service';
const answer = z.object({ questionId: z.string().max(60), choice: z.number().int().min(1).max(3).nullable() }).strict();
const fields = { expectedRevision: z.number().int().nonnegative(), answers: z.array(answer).max(10), pairUse: z.boolean() };
const schema = z.discriminatedUnion('action', [z.object({ action: z.literal('start') }).strict(), z.object({ action: z.literal('retry') }).strict(), z.object({ action: z.literal('draft'), ...fields }).strict(), z.object({ action: z.literal('finalize'), ...fields }).strict(), z.object({ action: z.literal('permission'), pairUse: z.boolean(), expectedPermissionRevision: z.number().int().nonnegative() }).strict()]);
type Context = { params: Promise<{ key: string }> };
export async function GET(req: NextRequest, context: Context) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const { key } = await context.params;
  return domainResponse(() => measurementTestsService.get(auth.data.userId, key));
}
export async function POST(req: NextRequest, context: Context) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, schema);
  if (!body.ok) return body.response;
  const { key } = await context.params;
  return domainResponse(() => measurementTestsService.mutate(auth.data.userId, key, body.data));
}
