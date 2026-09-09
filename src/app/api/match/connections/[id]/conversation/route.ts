import type { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeMatchingConversationMutation, getMatchingConversation, updateMatchingConversation } from "@/domain/services/matching/matchingConversation.service";
import { parseJson, parseParams } from "@/lib/api/validate";
import { matchingMutationResponse, matchingReadResponse, prepareMatchingRequest } from "../../../_shared";
import { idParamsSchema } from "../../../schemas";

const ROUTE = "/api/match/connections/[id]/conversation";
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("SUBMIT"), topicKey: z.string().min(1).max(128), round: z.number().int().min(1), text: z.string().trim().min(1).max(2000), revealConsent: z.literal(true) }).strict(),
  z.object({ action: z.literal("WITHDRAW"), topicKey: z.string().min(1).max(128), round: z.number().int().min(1) }).strict(),
  z.object({ action: z.literal("DISCORD_CONSENT"), discordConsent: z.boolean() }).strict(),
]);
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, context: Context) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const params = parseParams(await context.params, idParamsSchema);
  if (!params.ok) return params.response;
  return matchingReadResponse(() => getMatchingConversation({ currentUserId: request.currentUserId, connectionId: params.data.id }));
}
export async function POST(req: NextRequest, context: Context) {
  const request = await prepareMatchingRequest(req, ROUTE);
  if (!request.ok) return request.response;
  const params = parseParams(await context.params, idParamsSchema);
  if (!params.ok) return params.response;
  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;
  return matchingMutationResponse({ req, route: ROUTE, currentUserId: request.currentUserId, requestBody: { ...body.data, connectionId: params.data.id }, authorize: () => authorizeMatchingConversationMutation({ currentUserId: request.currentUserId, connectionId: params.data.id, requireMatching: body.data.action === "SUBMIT" || (body.data.action === "DISCORD_CONSENT" && body.data.discordConsent) }), execute: () => updateMatchingConversation({ currentUserId: request.currentUserId, connectionId: params.data.id, ...body.data }) });
}
