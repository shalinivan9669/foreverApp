"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getMatchingEligibility } from "@/lib/contracts/matchingEligibility";
import { useCurrentUser } from "./useCurrentUser";
import { usePair } from "./usePair";
import { useRefreshOnReturn } from "./useRefreshOnReturn";

/** Re-check saved intent and active/paused membership before mounting matching UI. */
export function useMatchingAccess() {
  const user = useCurrentUser({ enabled: false });
  const pair = usePair({ enabled: false });
  const [verifiedUserId, setVerifiedUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const version = useRef(0);
  const { refetch: refreshUser } = user;
  const { refetchStatus, refetchPair } = pair;
  const refresh = useCallback(async () => {
    const current = ++version.current;
    setChecking(true);
    const [freshUser, freshStatus, freshPair] = await Promise.all([
      refreshUser(), refetchStatus(), refetchPair(),
    ]);
    if (current !== version.current) return;
    setVerifiedUserId(freshUser && freshStatus && freshPair ? freshUser.id : null);
    setChecking(false);
  }, [refreshUser, refetchStatus, refetchPair]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    return () => { active = false; version.current += 1; };
  }, [refresh]);
  useRefreshOnReturn(refresh);
  const hasPair = Boolean(pair.status?.hasActive || pair.pairMe?.pair && pair.pairMe.pair.status !== "ended");
  const eligibility = getMatchingEligibility({
    entryCohort: user.data?.entryCohort,
    relationshipStatus: user.data?.personal?.relationshipStatus,
    age: user.data?.personal?.age,
    hasPair,
  });
  const verified = Boolean(verifiedUserId && verifiedUserId === user.data?.id);
  return {
    user: user.data,
    pair: pair.pairMe?.pair ?? null,
    eligibility,
    allowed: verified && eligibility === "ELIGIBLE" && Boolean(user.data?.entryCompletedAt),
    verified,
    checking,
    error: user.error ?? pair.error,
    refresh,
  };
}
