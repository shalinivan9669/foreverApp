import type { NextRequest } from "next/server";
import { authorizeCreateMatchingLikeMutation, createMatchingLike } from "@/domain/services/matching/matchingApplication.service";
import { parseJson } from "@/lib/api/validate";
import { matchingMutationResponse, prepareMatchingRequest } from "../_shared";
import { createLikeBodySchema } from "../schemas";

const ROUTE = "/api/match/like";

export async function POST(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const body = await parseJson(req, createLikeBodySchema);
  if (!body.ok) return body.response;

  return matchingMutationResponse({
    req,
    route: ROUTE,
    currentUserId: request.currentUserId,
    requestBody: body.data,
    authorize: () => authorizeCreateMatchingLikeMutation({ currentUserId: request.currentUserId, candidateId: body.data.candidateId }),
    execute: ({ idempotencyKey }) =>
      createMatchingLike({
        currentUserId: request.currentUserId,
        ...body.data,
        idempotencyKey,
        auditRequest: request.auditRequest,
      }),
  });
}
