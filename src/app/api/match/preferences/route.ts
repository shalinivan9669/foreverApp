import type { NextRequest } from "next/server";
import {
  getMatchingPreferences,
  updateMatchingPreferences,
} from "@/domain/services/matching/matchingApplication.service";
import { parseJson } from "@/lib/api/validate";
import {
  matchingMutationResponse,
  matchingReadResponse,
  prepareMatchingRequest,
} from "../_shared";
import { matchingPreferencesBodySchema } from "../schemas";

const ROUTE = "/api/match/preferences";

export async function GET(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  return matchingReadResponse(() =>
    getMatchingPreferences({ currentUserId: request.currentUserId }),
  );
}

export async function PUT(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const body = await parseJson(req, matchingPreferencesBodySchema);
  if (!body.ok) return body.response;

  return matchingMutationResponse({
    req,
    route: ROUTE,
    currentUserId: request.currentUserId,
    requestBody: body.data,
    execute: ({ idempotencyKey }) =>
      updateMatchingPreferences({
        currentUserId: request.currentUserId,
        revision: body.data.revision,
        preferences: body.data.preferences,
        idempotencyKey,
        auditRequest: request.auditRequest,
      }),
  });
}
