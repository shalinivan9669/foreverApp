import type { NextRequest } from "next/server";
import { getMatchingLike } from "@/domain/services/matching/matchingApplication.service";
import { parseParams } from "@/lib/api/validate";
import { matchingReadResponse, prepareMatchingRequest } from "../../_shared";
import { idParamsSchema } from "../../schemas";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: Context) {
  const route = "/api/match/like/[id]";
  const request = await prepareMatchingRequest(req, route);
  if (!request.ok) return request.response;
  const params = parseParams(await context.params, idParamsSchema);
  if (!params.ok) return params.response;

  return matchingReadResponse(() =>
    getMatchingLike({
      currentUserId: request.currentUserId,
      likeId: params.data.id,
    }),
  );
}
