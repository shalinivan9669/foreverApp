import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { parseJson, parseParams, parseQuery } from "@/lib/api/validate";
import { domainResponse } from "@/lib/api/domainResponse";
import { withIdempotency } from "@/lib/idempotency/withIdempotency";
import { sharedLifeService } from "@/domain/services/sharedLife.service";
import { requirePairMember } from "@/lib/auth/resourceGuards";
import { jsonError } from "@/lib/api/response";
import {
  localDateSchema,
  sharedLifeCommandSchema,
} from "@/lib/contracts/sharedLife";

type Context = { params: Promise<{ id: string }> };
const paramsSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const querySchema = z.object({ today: localDateSchema });
export async function GET(req: NextRequest, ctx: Context) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;
  return domainResponse(() =>
    sharedLifeService.get(params.data.id, auth.data.userId, query.data.today),
  );
}
export async function POST(req: NextRequest, ctx: Context) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;
  const body = await parseJson(req, sharedLifeCommandSchema);
  if (!body.ok) return body.response;
  const pair = await requirePairMember(params.data.id, auth.data.userId);
  if (!pair.ok) return pair.response;
  if (pair.data.pair.status !== "active")
    return jsonError(404, "NOT_FOUND", "Пара недоступна.");
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(body.data))
    .digest("hex");
  return withIdempotency({
    req,
    route: `/api/pairs/${pair.data.pair._id.toString()}/shared-life`,
    userId: auth.data.userId,
    requestBody: { payloadHash, today: query.data.today },
    execute: async () => {
      const result = await sharedLifeService.update(
        pair.data.pair._id.toString(),
        auth.data.userId,
        sharedLifeCommandSchema.parse(body.data),
        query.data.today,
      );
      return { pairId: result.pairId, revision: result.revision };
    },
  });
}
