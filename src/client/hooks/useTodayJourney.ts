import { useCallback, useEffect, useRef, useState } from 'react';
import { entryApi } from '@/client/api/entry.api';
import { matchApi } from '@/client/api/match.api';
import { pairInvitesApi } from '@/client/api/pairInvites.api';
import { toUiErrorState, type UiErrorState } from '@/client/api/errors';
import type { CurrentUserDTO } from '@/client/api/types';
import { getMatchingEligibility } from '@/lib/contracts/matchingEligibility';

import type { TodayJourney } from '@/client/viewmodels/today.viewmodels';
type JourneyState = { scope: string; step: TodayJourney | null; error: UiErrorState | null };

/** Resolve owner prerequisites; never publish a card or create an invitation on read. */
export function useTodayJourney(user: CurrentUserDTO | null, enabled: boolean) {
  const scope = enabled && user ? JSON.stringify([user.id, user.entryCohort, user.entryCompletedAt, user.personal, user.updatedAt]) : '';
  const [state, setState] = useState<JourneyState>({ scope: '', step: null, error: null });
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    const request = ++version.current;
    if (!scope) return;
    setState({ scope, step: null, error: null });
    try {
      const entry = await entryApi.get(active.signal);
      let step: TodayJourney;
      if (!entry.user.entryCompletedAt || !entry.user.entryCohort) step = 'ENTRY';
      else if (!entry.onboardingCompleted) step = 'ONBOARDING';
      else if (getMatchingEligibility({ entryCohort: entry.user.entryCohort, relationshipStatus: entry.user.personal?.relationshipStatus, age: entry.user.personal?.age, hasPair: entry.hasPair }) === 'ELIGIBLE') {
        if (!entry.user.location) step = 'LOCATION';
        else {
          const card = await matchApi.getOwnCard(active.signal);
          step = card.card?.active && card.requiredDataReady ? 'SEARCH' : 'CARD';
        }
      } else {
        const invite = await pairInvitesApi.getCurrent(active.signal);
        step = invite?.status === 'ACTIVE' ? invite.awaitingOwnerConfirmation ? 'INVITE_CONFIRM' : 'INVITE_WAITING' : 'INVITE';
      }
      if (!active.signal.aborted && request === version.current) setState({ scope, step, error: null });
    } catch (error) {
      if (!active.signal.aborted && request === version.current) setState({ scope, step: null, error: toUiErrorState(error instanceof Error ? error : new Error('Не удалось проверить следующий шаг.')) });
    }
  }, [scope]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; controller.current?.abort(); version.current += 1; };
  }, [refresh]);
  const inScope = Boolean(scope && state.scope === scope);
  return { step: inScope ? state.step : null, error: inScope ? state.error : null, loading: Boolean(scope && (!inScope || (!state.step && !state.error))), refresh };
}
