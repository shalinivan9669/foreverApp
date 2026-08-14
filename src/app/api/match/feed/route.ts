import type { NextRequest } from "next/server";
import { getMatchingFeed } from "@/domain/services/matching/matchingApplication.service";
import { parseQuery } from "@/lib/api/validate";
import { matchingReadResponse, prepareMatchingRequest } from "../_shared";
import { listQuerySchema } from "../schemas";

const ROUTE = "/api/match/feed";

export async function GET(req: NextRequest) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const query = parseQuery(req, listQuerySchema);
  if (!query.ok) return query.response;

  return matchingReadResponse(() =>
    getMatchingFeed({
      currentUserId: request.currentUserId,
      ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
      limit: query.data.limit ?? 20,
    }),
  );
}
