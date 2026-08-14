import type { NextRequest } from "next/server";
import {
  getOwnMatchingCard,
  saveOwnMatchingCard,
} from "@/domain/services/matching/matchingApplication.service";
import { parseJson } from "@/lib/api/validate";
import {
  matchingMutationResponse,
  matchingReadResponse,
  prepareMatchingRequest,
} from "../_shared";
import { matchingCardBodySchema } from "../schemas";

const ROUTE = "/api/match/card";

export async function GET(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  return matchingReadResponse(() =>
    getOwnMatchingCard({ currentUserId: request.currentUserId }),
  );
}

export async function POST(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const body = await parseJson(req, matchingCardBodySchema);
  if (!body.ok) return body.response;

  return matchingMutationResponse({
    req,
    route: ROUTE,
    currentUserId: request.currentUserId,
    requestBody: body.data,
    execute: ({ idempotencyKey }) =>
      saveOwnMatchingCard({
        currentUserId: request.currentUserId,
        card: body.data,
        idempotencyKey,
        auditRequest: request.auditRequest,
      }),
  });
}
