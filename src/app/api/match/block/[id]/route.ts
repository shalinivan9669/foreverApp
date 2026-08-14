import type { NextRequest } from "next/server";
import { unblockMatchingUser } from "@/domain/services/matching/matchingApplication.service";
import { parseParams } from "@/lib/api/validate";
import {
  matchingMutationResponse,
  prepareMatchingRequest,
} from "../../_shared";
import { idParamsSchema } from "../../schemas";

interface Context {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, context: Context) {
  const route = "/api/match/block/[id]";
  const request = await prepareMatchingRequest(req, route);
  if (!request.ok) return request.response;
  const params = parseParams(await context.params, idParamsSchema);
  if (!params.ok) return params.response;
  const requestBody = { blockedUserId: params.data.id };

  return matchingMutationResponse({
    req,
    route,
    currentUserId: request.currentUserId,
    requestBody,
    execute: () =>
      unblockMatchingUser({
        currentUserId: request.currentUserId,
        blockedUserId: params.data.id,
        auditRequest: request.auditRequest,
      }),
  });
}
