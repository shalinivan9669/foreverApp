"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pairInvitesApi, type PairInviteAvailabilityDTO, type PairInviteLookup } from "@/client/api/pairInvites.api";
import { entryApi } from "@/client/api/entry.api";
import { toUiErrorState } from "@/client/api/errors";
import { parsePairInviteInput } from "@/client/viewmodels/pairInviteAcceptance";

type InvitePhase = "idle" | "available" | "waiting_confirmation" | "accepted" | "unavailable" | "entry_required" | "onboarding_required";

export function usePairInviteAcceptance(actorId: string, onPairChanged: () => Promise<void>) {
  const [value, setValue] = useState("");
  const [lookup, setLookup] = useState<PairInviteLookup | null>(null);
  const [invite, setInvite] = useState<PairInviteAvailabilityDTO | null>(null);
  const [phase, setPhase] = useState<InvitePhase>("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); }, [actorId]);

  const changeValue = useCallback((next: string) => {
    if (pending.current) return;
    generation.current += 1;
    abort.current?.abort();
    setValue(next); setLookup(null); setInvite(null); setPhase("idle"); setConfirmed(false); setError(null);
  }, []);

  const inspect = useCallback(async () => {
    if (pending.current) return false;
    const parsed = parsePairInviteInput(value);
    if (!parsed) { setError("Введите полный код VM-XXXXXXXX-XXXXXXXX-XXXXXXXX, ключ приглашения или ссылку партнёра."); return false; }
    pending.current = true;
    const version = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(null); setConfirmed(false); setInvite(null); setLookup(parsed);
    try {
      const result = await pairInvitesApi.resolve(parsed, controller.signal);
      let nextPhase: InvitePhase = result.availability;
      if (result.availability === "available") {
        const entry = await entryApi.get(controller.signal);
        if (entry.hasPair) nextPhase = "unavailable";
        else if (!entry.user.entryCompletedAt || entry.user.entryCohort !== "EXISTING_PARTNER") nextPhase = "entry_required";
        else if (!entry.onboardingCompleted) nextPhase = "onboarding_required";
      }
      if (controller.signal.aborted || version !== generation.current) return false;
      setInvite(result); setPhase(nextPhase);
      if (nextPhase === "accepted" || nextPhase === "unavailable") await onPairChanged();
      return true;
    } catch (caught) {
      if (version === generation.current && !controller.signal.aborted && caught instanceof Error) {
        setPhase("idle"); setError(toUiErrorState(caught).message);
      }
      return false;
    } finally {
      if (version === generation.current) { pending.current = false; setBusy(false); }
    }
  }, [value, onPairChanged]);

  const accept = useCallback(async () => {
    if (pending.current || !lookup || !confirmed || phase !== "available" || !invite?.partner) return false;
    pending.current = true; setBusy(true); setError(null);
    const version = ++generation.current;
    try {
      const result = await pairInvitesApi.accept(lookup);
      if (version !== generation.current) return false;
      setConfirmed(false);
      setPhase(result.status === "ACCEPTED" ? "accepted" : "waiting_confirmation");
      if (result.pairId) setInvite((current) => current ? { ...current, pairId: result.pairId, availability: "accepted" } : current);
      await onPairChanged();
      return true;
    } catch (caught) {
      if (version === generation.current && caught instanceof Error) {
        const mapped = toUiErrorState(caught);
        setError(mapped.message); setConfirmed(false); setInvite(null); setPhase("idle");
        await onPairChanged();
      }
      return false;
    } finally {
      if (version === generation.current) { pending.current = false; setBusy(false); }
    }
  }, [lookup, confirmed, phase, invite, onPairChanged]);

  const setupHref = lookup ? `${phase === "entry_required" ? "/entry" : "/mvp-onboarding"}#${new URLSearchParams({ return: "join", ...lookup })}` : "/entry";
  return { value, changeValue, invite, phase, confirmed, setConfirmed, busy, error, inspect, accept, setupHref };
}
