import type { PairInviteLookup } from "@/client/api/pairInvites.api";

/** Invite input is parsed locally; pasted URLs are never fetched or navigated to. */
export function parsePairInviteInput(value: string): PairInviteLookup | null {
  const input = value.trim();
  if (/^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/i.test(input)) return { partnerCode: input.toUpperCase() };
  if (/^[A-Za-z0-9_-]{43}$/.test(input)) return { token: input };
  try {
    const url = new URL(input, "https://invite.invalid");
    if (!["https:", "http:"].includes(url.protocol) || url.pathname !== "/join") return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const token = fragment.get("token");
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) return { token };
    const code = fragment.get("partnerCode");
    if (code && /^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/i.test(code)) return { partnerCode: code.toUpperCase() };
  } catch { /* Invalid input is explained before any private request. */ }
  return null;
}
