import { authorizeMatchingLikeMutation } from "@/domain/services/matching/matchingApplication.service";
import type { NextRequest } from "next/server";
import { acceptMatchingLike } from "@/domain/services/matching/matchingApplication.service";
import { parseJson } from "@/lib/api/validate";
import { matchingMutationResponse, prepareMatchingRequest } from "../_shared";
import { likeDecisionBodySchema } from "../schemas";

const ROUTE = "/api/match/accept";

export async function POST(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const body = await parseJson(req, likeDecisionBodySchema);
  if (!body.ok) return body.response;

  return matchingMutationResponse({
    req,
    route: ROUTE,
    currentUserId: request.currentUserId,
    requestBody: body.data,
    authorize: () => authorizeMatchingLikeMutation({ currentUserId: request.currentUserId, likeId: body.data.likeId, requireMatching: true }),
    execute: () =>
      acceptMatchingLike({
        currentUserId: request.currentUserId,
        likeId: body.data.likeId,
        auditRequest: request.auditRequest,
      }),
  });
}
