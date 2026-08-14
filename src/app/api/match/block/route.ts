import type { NextRequest } from "next/server";
import { blockMatchingUser } from "@/domain/services/matching/matchingApplication.service";
import { parseJson } from "@/lib/api/validate";
import { matchingMutationResponse, prepareMatchingRequest } from "../_shared";
import { blockBodySchema } from "../schemas";

const ROUTE = "/api/match/block";

export async function POST(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const body = await parseJson(req, blockBodySchema);
  if (!body.ok) return body.response;

  return matchingMutationResponse({
    req,
    route: ROUTE,
    currentUserId: request.currentUserId,
    requestBody: body.data,
    execute: () =>
      blockMatchingUser({
        currentUserId: request.currentUserId,
        blockedUserId: body.data.blockedUserId,
        auditRequest: request.auditRequest,
      }),
  });
}
