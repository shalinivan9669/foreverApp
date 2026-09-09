"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useMatchingAccess } from "@/client/hooks/useMatchingAccess";
import { mvpOnboardingApi } from "@/client/api/mvpOnboarding.api";
import { toUiErrorState, type UiErrorState } from "@/client/api/errors";
import { matchApi } from "@/client/api/match.api";
import LoadingView from "@/components/ui/LoadingView";
import { matchingHistoryAvailable } from "@/client/viewmodels/matchingHistory";

const MatchingAccessContext = createContext<(() => Promise<void>) | null>(null);
export const useRecheckMatchingAccess = () => useContext(MatchingAccessContext);
const MatchingProgressContext = createContext(true);
export const useMatchingProgressAllowed = () => useContext(MatchingProgressContext);

export default function MatchingAccessGate({ children, requireCard = false, allowHistory = false }: { children: ReactNode; requireCard?: boolean; allowHistory?: boolean }) {
  const access = useMatchingAccess();
  const router = useRouter();
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [prerequisiteError, setPrerequisiteError] = useState<UiErrorState | null>(null);
  const [redirectHref, setRedirectHref] = useState<string | null>(null);
  const generation = useRef(0);
  const historyAvailable = matchingHistoryAvailable({ verified: access.verified, entryCompleted: Boolean(access.user?.entryCompletedAt), eligibility: access.eligibility });
  const historyOnly = allowHistory && !requireCard && historyAvailable;
  const canOpen = access.allowed || historyOnly;
  const userId = canOpen ? access.user?.id : undefined;
  const verifyPrerequisites = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return;
    const current = ++generation.current;
    setPrerequisiteError(null);
    try {
      const onboarding = await mvpOnboardingApi.getOwnerState(signal);
      if (signal?.aborted || current !== generation.current) return;
      if (onboarding.session?.status !== "completed") {
        setRedirectHref("/mvp-onboarding?intent=matching");
        return;
      }
      if (requireCard) {
        const card = await matchApi.getOwnCard(signal);
        if (signal?.aborted || current !== generation.current) return;
        if (!card.card?.active || !card.requiredDataReady) {
          setRedirectHref("/match-card/create");
          return;
        }
      }
      setRedirectHref(null);
      setReadyFor(userId);
    } catch (error) {
      if (!signal?.aborted && current === generation.current && error instanceof Error) setPrerequisiteError(toUiErrorState(error));
    }
  }, [userId, requireCard]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void verifyPrerequisites(controller.signal); });
    return () => { controller.abort(); generation.current += 1; };
  }, [verifyPrerequisites]);
  const entryRequired = access.verified && (access.eligibility === "ENTRY_REQUIRED" || access.eligibility === "ELIGIBLE" && !access.user?.entryCompletedAt);
  const nextHref = entryRequired ? "/entry?intent=matching" : canOpen ? redirectHref : null;
  useEffect(() => { if (nextHref) router.replace(nextHref); }, [nextHref, router]);
  const recheckAccess = access.refresh;
  useEffect(() => {
    if (prerequisiteError?.code === "MATCHING_SOLO_REQUIRED") void recheckAccess();
  }, [prerequisiteError?.code, recheckAccess]);

  if (!access.verified && access.checking) return <main className="app-shell-narrow py-6"><LoadingView label="Проверяем ваш маршрут…" /></main>;
  if ((access.error || prerequisiteError) && (!access.verified || canOpen || entryRequired)) {
    const error = access.error ?? prerequisiteError;
    return <main className="app-shell-narrow py-6"><section className="app-panel p-5" role="alert"><h1 className="text-xl font-semibold">Не удалось проверить доступ к знакомствам</h1><p className="app-muted mt-2">{error?.message}</p><button className="app-btn-primary mt-4" onClick={() => { void access.refresh(); void verifyPrerequisites(); }}>Повторить проверку</button><Link className="app-btn-secondary ml-2 mt-4" href="/main-menu">Главное меню</Link></section></main>;
  }
  if (access.verified && !canOpen && !entryRequired) return <main className="app-shell-narrow py-6"><section className="app-panel p-5" role="status"><h1 className="text-xl font-semibold">{access.eligibility === "ADULT_REQUIRED" ? "Знакомства доступны с 18 лет" : "Ваш маршрут — отношения с партнёром"}</h1><p className="app-muted mt-3">{access.eligibility === "PAIR_ACTIVE" ? "У вас уже есть пара. Поиск новых партнёров и новые знакомства недоступны, в том числе во время паузы пары." : access.eligibility === "EXISTING_PARTNER" ? "Вы указали, что у вас есть партнёр. Поиск новых знакомств недоступен и до связывания аккаунтов. Продолжайте путь со своим партнёром или выбирайте личное развитие." : "Продолжить личное развитие и открыть настройки можно из главного меню."}</p><div className="mt-4 flex flex-wrap gap-2"><Link className="app-btn-primary" href={access.eligibility === "EXISTING_PARTNER" ? "/invite" : "/main-menu"}>{access.eligibility === "EXISTING_PARTNER" ? "Пригласить своего партнёра" : "Главное меню"}</Link><Link className="app-btn-secondary" href="/development">Личное развитие</Link>{historyAvailable && <Link className="app-btn-secondary" href="/match/inbox">Прежние знакомства</Link>}<Link className="app-btn-secondary" href="/profile/history">Моя история</Link><Link className="app-btn-secondary" href="/profile/safety">Безопасность</Link></div></section></main>;
  if (!userId || readyFor !== userId || nextHref) return <main className="app-shell-narrow py-6"><LoadingView label={nextHref ? "Открываем следующий шаг подготовки…" : "Проверяем готовность к знакомствам…"} />{nextHref && <Link className="app-btn-secondary mt-4" href={nextHref}>Продолжить подготовку</Link>}</main>;
  return <MatchingAccessContext.Provider value={access.refresh}><MatchingProgressContext.Provider value={access.allowed}><div aria-busy={access.checking} inert={access.checking || undefined}>{historyOnly && <aside className="app-shell-narrow pt-4" role="status"><div className="app-panel-soft p-4"><p className="font-semibold">Ваши прежние знакомства</p><p className="app-muted mt-2 text-sm">Можно просмотреть доступную историю, отозвать интерес, отказаться или завершить знакомство. Новые знакомства и ответы недоступны в текущем режиме отношений.</p><Link className="app-btn-secondary mt-3" href="/profile">Мой профиль</Link></div></aside>}{children}</div></MatchingProgressContext.Provider></MatchingAccessContext.Provider>;
}
