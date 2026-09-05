import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { parseParams } from "@/lib/api/validate";
import { domainResponse } from "@/lib/api/domainResponse";
import { developmentService } from "@/domain/services/development.service";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const params = parseParams(
    await ctx.params,
    z.object({ id: z.string().regex(/^[a-f\d]{64}$/) }),
  );
  if (!params.ok) return params.response;
  return domainResponse(() =>
    developmentService.detail(auth.data.userId, params.data.id),
  );
}
