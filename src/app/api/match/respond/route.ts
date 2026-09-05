import { authorizeMatchingLikeMutation } from "@/domain/services/matching/matchingApplication.service";
import type { NextRequest } from "next/server";
import { respondMatchingLike } from "@/domain/services/matching/matchingApplication.service";
import { parseJson } from "@/lib/api/validate";
import { matchingMutationResponse, prepareMatchingRequest } from "../_shared";
import { respondLikeBodySchema } from "../schemas";

const ROUTE = "/api/match/respond";

export async function POST(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const body = await parseJson(req, respondLikeBodySchema);
  if (!body.ok) return body.response;

  return matchingMutationResponse({
    req,
    route: ROUTE,
    currentUserId: request.currentUserId,
    requestBody: body.data,
    authorize: () => authorizeMatchingLikeMutation({ currentUserId: request.currentUserId, likeId: body.data.likeId }),
    execute: () =>
      respondMatchingLike({
        currentUserId: request.currentUserId,
        ...body.data,
        auditRequest: request.auditRequest,
      }),
  });
}
