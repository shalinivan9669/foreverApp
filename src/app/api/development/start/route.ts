import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { parseJson } from "@/lib/api/validate";
import { withIdempotency } from "@/lib/idempotency/withIdempotency";
import { developmentService } from "@/domain/services/development.service";
import { requirePairMember } from "@/lib/auth/resourceGuards";
import { jsonError } from "@/lib/api/response";
import { domainRoute } from "@/lib/api/domainResponse";
import { economyService } from "@/domain/services/economy.service";

const bodySchema = z
  .object({
    contentKey: z.string().min(1).max(100),
    pairId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
  })
  .strict();
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  if (body.data.pairId) {
    const pair = await requirePairMember(body.data.pairId, auth.data.userId);
    if (!pair.ok) return pair.response;
    if (pair.data.pair.status !== "active")
      return jsonError(404, "NOT_FOUND", "Пара недоступна.");
  }
  return domainRoute(async () => {
    await economyService.assertContentAccess({
      userId: auth.data.userId,
      contentKey: body.data.contentKey,
    });
    return withIdempotency({
      req,
      route: "/api/development/start",
      userId: auth.data.userId,
      requestBody: body.data,
      execute: async () => {
        const result = await developmentService.start(
          auth.data.userId,
          body.data.contentKey,
          body.data.pairId,
        );
        return { runId: result.run.id };
      },
    });
  });
}
