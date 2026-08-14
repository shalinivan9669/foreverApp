import type { NextRequest } from "next/server";
import { confirmMatchingConnection } from "@/domain/services/matching/matchingApplication.service";
import { parseJson } from "@/lib/api/validate";
import { matchingMutationResponse, prepareMatchingRequest } from "../_shared";
import { confirmationBodySchema } from "../schemas";

const ROUTE = "/api/match/confirm";

export async function POST(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const body = await parseJson(req, confirmationBodySchema);
  if (!body.ok) return body.response;

  return matchingMutationResponse({
    req,
    route: ROUTE,
    currentUserId: request.currentUserId,
    requestBody: body.data,
    execute: () =>
      confirmMatchingConnection({
        currentUserId: request.currentUserId,
        connectionId: body.data.connectionId,
        action: body.data.action,
        auditRequest: request.auditRequest,
      }),
  });
}
