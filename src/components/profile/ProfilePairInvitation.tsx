"use client";

import Link from "next/link";
import type { CurrentUserDTO } from "@/client/api/types";
import { usePair } from "@/client/hooks/usePair";
import { useRefreshOnReturn } from "@/client/hooks/useRefreshOnReturn";
import { usePairInviteAcceptance } from "@/client/hooks/usePairInviteAcceptance";
import LoadingView from "@/components/ui/LoadingView";

export default function ProfilePairInvitation({ user }: { user: CurrentUserDTO }) {
  const pair = usePair();
  useRefreshOnReturn(pair.refetch);
  if (pair.loading && (!pair.pairMe || !pair.status)) return <section className="app-panel p-4"><LoadingView compact label="Проверяем связь с партнёром…" /></section>;
  if (pair.error) return <section className="app-panel p-4" role="alert"><h2 className="text-lg font-semibold">Связь с партнёром</h2><p className="app-muted mt-2">Не удалось проверить текущую пару. Обновите состояние перед принятием приглашения.</p><button className="app-btn-secondary mt-3" onClick={() => void pair.refetch()}>Проверить пару</button></section>;
  if (pair.status?.hasActive || pair.pairMe?.pair && pair.pairMe.pair.status !== "ended") return <section className="app-panel p-4" aria-labelledby="profile-pair-title"><h2 id="profile-pair-title" className="text-lg font-semibold">Ваши аккаунты уже связаны</h2><p className="app-muted mt-2">{pair.pairMe?.pair?.status === "paused" ? "Ваша пара на паузе. Связь аккаунтов сохраняется; принять приглашение в другую пару нельзя." : "Общая область вашей пары доступна по кнопке ниже. Принимать приглашение повторно не нужно."}</p><Link className="app-btn-primary mt-3" href={pair.pairId ? `/pair/${encodeURIComponent(pair.pairId)}` : "/main-menu"}>Открыть нашу пару</Link></section>;
  return <InlineInviteAcceptance key={user.id} user={user} onPairChanged={pair.refetch} />;
}

function InlineInviteAcceptance({ user, onPairChanged }: { user: CurrentUserDTO; onPairChanged: () => Promise<void> }) {
  const flow = usePairInviteAcceptance(user.id, onPairChanged);
  return <section className="app-panel app-panel-solid space-y-4 p-4 sm:p-5" aria-labelledby="profile-invite-title">
    <div><h2 id="profile-invite-title" className="text-lg font-semibold">Принять приглашение партнёра</h2><p className="app-muted mt-2 text-sm">Если у вас уже есть партнёр, свяжите ваши аккаунты здесь. Вставьте его код «Вместе», ключ или ссылку приглашения, затем сверьте человека перед согласием.</p></div>
    <form onSubmit={(event) => { event.preventDefault(); void flow.inspect(); }} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="profile-partner-invite">Код или ссылка приглашения партнёра</label>
      <input id="profile-partner-invite" value={flow.value} onChange={(event) => flow.changeValue(event.target.value)} disabled={flow.busy} maxLength={2048} autoComplete="off" spellCheck={false} placeholder="VM-XXXXXXXX-XXXXXXXX-XXXXXXXX" className="w-full" aria-describedby="profile-invite-hint" />
      <p id="profile-invite-hint" className="app-muted text-sm">Проверка кода ещё не создаёт пару и не открывает ваши личные ответы.</p>
      <button type="submit" disabled={flow.busy || !flow.value.trim()} className="app-btn-secondary">{flow.busy ? "Проверяем…" : flow.phase === "waiting_confirmation" ? "Проверить подтверждение партнёра" : "Проверить приглашение"}</button>
    </form>
    {(flow.phase === "available" || flow.phase === "waiting_confirmation") && flow.invite?.partner && <div className="app-panel-soft p-4"><p className="font-semibold">{flow.invite.partner.username}</p><p className="mt-1 break-all font-mono text-sm">{flow.invite.partner.publicId}</p><p className="app-muted mt-2 text-sm">Сверьте имя и код со своим партнёром.</p></div>}
    {flow.phase === "available" && <div className="space-y-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={flow.confirmed} disabled={flow.busy} onChange={(event) => flow.setConfirmed(event.target.checked)} />Это мой партнёр. Я добровольно хочу связать с ним аккаунт и создать пару.</label><button className="app-btn-primary" disabled={flow.busy || !flow.confirmed || !flow.invite?.partner} onClick={() => void flow.accept()}>Принять приглашение в пару</button><p className="app-muted text-sm">После вашего принятия партнёр должен отдельно подтвердить вас. Пара создаётся после согласия обоих.</p></div>}
    {flow.phase === "waiting_confirmation" && <p className="app-panel-soft p-4 text-sm" role="status">Ваше принятие сохранено. Теперь партнёр должен открыть своё приглашение и подтвердить ваше имя и код. Обновите проверку здесь, когда он закончит.</p>}
    {flow.phase === "accepted" && <div role="status"><p>Оба подтвердили. Ваша пара создана.</p><Link className="app-btn-primary mt-3" href={flow.invite?.pairId ? `/pair/${encodeURIComponent(flow.invite.pairId)}` : "/main-menu"}>Открыть нашу пару</Link></div>}
    {flow.phase === "unavailable" && <p className="app-panel-soft p-4 text-sm" role="status">Приглашение недоступно: оно могло истечь, быть отменено или участник уже состоит в связанной паре. Попросите партнёра проверить действующее приглашение.</p>}
    {(flow.phase === "entry_required" || flow.phase === "onboarding_required") && <div className="app-panel-soft p-4"><p className="text-sm">Для связывания выберите путь «У меня уже есть партнёр» и завершите личную настройку. Приглашение сохранится в ссылке возврата.</p><Link className="app-btn-primary mt-3" href={flow.setupHref}>Продолжить настройку и вернуться к приглашению</Link></div>}
    {flow.error && <p className="app-alert app-alert-error" role="alert">{flow.error}</p>}
    <Link className="inline-block text-sm underline" href="/invite">Создать своё приглашение или подтвердить отклик партнёра</Link>
  </section>;
}
