import { z } from "zod";
import { http } from "./http";
import { ApiClientError } from "./errors";
import type { ApiJsonValue } from "./types";
import type { MatchingConversationDTO } from "@/lib/contracts/matchingProduct";

const schema: z.ZodType<MatchingConversationDTO> = z.object({
  topics: z.array(z.object({ topicKey: z.string(), title: z.string(), prompt: z.string(), round: z.number().int().positive(), ownAnswer: z.string().optional(), partnerSubmitted: z.boolean(), partnerAnswer: z.string().optional(), revealed: z.boolean() })),
  checklist: z.array(z.object({ key: z.string(), label: z.string(), complete: z.boolean() })),
  canWrite: z.boolean(), discordAvailable: z.boolean(), discordConsent: z.boolean(), discordUrl: z.string().regex(/^https:\/\/discord\.com\/users\/\d{5,30}$/).optional(),
});
export type ConversationCommand =
  | { action: "SUBMIT"; topicKey: string; round: number; text: string; revealConsent: true }
  | { action: "WITHDRAW"; topicKey: string; round: number }
  | { action: "DISCORD_CONSENT"; discordConsent: boolean };
const normalize = (value: ApiJsonValue) => {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiClientError({ status: 500, code: "INVALID_ENVELOPE", message: "Invalid conversation response" });
  return result.data;
};
export const matchingConversationApi = {
  async get(connectionId: string, signal?: AbortSignal) {
    return normalize(await http.get<ApiJsonValue>(`/api/match/connections/${encodeURIComponent(connectionId)}/conversation`, { signal, cache: "no-store" }));
  },
  async update(connectionId: string, body: ConversationCommand) {
    return normalize(await http.post<ApiJsonValue, ConversationCommand>(`/api/match/connections/${encodeURIComponent(connectionId)}/conversation`, body, { cache: "no-store" }));
  },
};
