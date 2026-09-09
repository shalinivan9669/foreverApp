import { pairHistoryApi, type PairHistoryItemDTO } from './pairHistory.api';

// Traverse the existing guarded cursor endpoint. Every page is scoped to the
// session actor and pair; a notification URL supplies no access capability.
export async function findNotificationHistoryItem(
  pairId: string,
  kind: PairHistoryItemDTO['kind'],
  id: string,
  signal: AbortSignal,
): Promise<PairHistoryItemDTO | null> {
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    if (signal.aborted) return null;
    const page = await pairHistoryApi.list(pairId, { cursor, limit: 20, signal });
    if (signal.aborted) return null;
    const found = page.items.find((item) => item.kind === kind && item.id === id);
    if (found) return found;
    if (!page.nextCursor || seen.has(page.nextCursor)) return null;
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return null;
}
