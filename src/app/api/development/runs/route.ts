import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { parseQuery } from "@/lib/api/validate";
import { domainResponse } from "@/lib/api/domainResponse";
import { developmentService } from "@/domain/services/development.service";

const querySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
}).strict();

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const query = parseQuery(req, querySchema);
  if (!query.ok) return query.response;
  return domainResponse(() => developmentService.listUnfinishedRuns(auth.data.userId, query.data.cursor));
}
