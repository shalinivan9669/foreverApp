import type { NextRequest } from "next/server";
import { getCandidateMatchingCard } from "@/domain/services/matching/matchingApplication.service";
import { parseParams } from "@/lib/api/validate";
import { matchingReadResponse, prepareMatchingRequest } from "../../_shared";
import { idParamsSchema, readCandidateGrant } from "../../schemas";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: Context) {
  const route = "/api/match/card/[id]";
  const request = await prepareMatchingRequest(req, route);
  if (!request.ok) return request.response;
  const params = parseParams(await context.params, idParamsSchema);
  if (!params.ok) return params.response;
  const grant = readCandidateGrant(req);
  if (!grant.ok) return grant.response;

  return matchingReadResponse(() =>
    getCandidateMatchingCard({
      currentUserId: request.currentUserId,
      candidateId: params.data.id,
      candidateGrant: grant.data,
    }),
  );
}
