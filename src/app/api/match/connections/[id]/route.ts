import type { NextRequest } from "next/server";
import { getMatchingConnection } from "@/domain/services/matching/matchingApplication.service";
import { parseParams } from "@/lib/api/validate";
import { matchingReadResponse, prepareMatchingRequest } from "../../_shared";
import { idParamsSchema } from "../../schemas";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: Context) {
  const route = "/api/match/connections/[id]";
  const request = await prepareMatchingRequest(req, route);
  if (!request.ok) return request.response;
  const params = parseParams(await context.params, idParamsSchema);
  if (!params.ok) return params.response;

  return matchingReadResponse(() =>
    getMatchingConnection({
      currentUserId: request.currentUserId,
      connectionId: params.data.id,
    }),
  );
}
