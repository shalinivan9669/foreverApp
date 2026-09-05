import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { parseJson } from "@/lib/api/validate";
import { withIdempotency } from "@/lib/idempotency/withIdempotency";
import { developmentService } from "@/domain/services/development.service";
import { domainRoute } from "@/lib/api/domainResponse";

const bodySchema = z
  .object({
    runId: z.string().regex(/^[a-f\d]{64}$/),
    answers: z
      .array(
        z
          .object({
            question: z.number().int().min(0).max(20),
            value: z.number().int().min(0).max(3).nullable(),
          })
          .strict(),
      )
      .max(20),
    feedback: z.enum(["HELPFUL", "NEUTRAL", "NOT_FOR_ME"]),
    privateNote: z.string().trim().max(2000).default(""),
  })
  .strict();
export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(body.data))
    .digest("hex");
  return domainRoute(async () => {
    await developmentService.assertRunAccess(auth.data.userId, body.data.runId);
    return withIdempotency({
      req,
      route: "/api/development/complete",
      userId: auth.data.userId,
      requestBody: { runId: body.data.runId, payloadHash },
      execute: async () => {
        const result = await developmentService.complete(auth.data.userId, {
          ...body.data,
          privateNote: body.data.privateNote ?? "",
        });
        return { runId: result.run.id };
      },
    });
  });
}
