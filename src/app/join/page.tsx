'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isApiClientError } from '@/client/api/errors';
import { entryApi } from '@/client/api/entry.api';
import { pairInvitesApi, type PairInviteAvailabilityDTO, type PairInviteLookup } from '@/client/api/pairInvites.api';
import { bootstrapDiscordSession, discordBootstrapMessage } from '@/client/discord/bootstrap';
import BackBar from '@/components/ui/BackBar';
import LoadingView from '@/components/ui/LoadingView';

type JoinPhase = 'checking' | 'auth_required' | 'entry_required' | 'onboarding_required' |
  'available' | 'waiting_confirmation' | 'accepted' | 'unavailable' | 'check_failed';

const readLookupFromFragment = (): PairInviteLookup | null => {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get('token')?.trim();
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) return { token };
  const partnerCode = fragment.get('partnerCode')?.trim().toUpperCase();
  return partnerCode && /^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(partnerCode) ? { partnerCode } : null;
};

const inspectInvite = async (lookup: PairInviteLookup, signal?: AbortSignal): Promise<{ phase: JoinPhase; invite: PairInviteAvailabilityDTO }> => {
  const invite = await pairInvitesApi.resolve(lookup, signal);
  if (invite.availability !== 'available') return { phase: invite.availability, invite };
  const entry = await entryApi.get(signal);
  if (!entry.user.entryCompletedAt || entry.user.entryCohort !== 'EXISTING_PARTNER') return { phase: 'entry_required', invite };
  return { phase: entry.onboardingCompleted ? 'available' : 'onboarding_required', invite };
};

const failurePhase = (error: Error): JoinPhase => {
  if (isApiClientError(error)) {
    if (error.status === 401) return 'auth_required';
    if (error.code === 'ONBOARDING_REQUIRED') return 'onboarding_required';
    if (error.code === 'PAIR_ENTRY_REQUIRED') return 'entry_required';
    if (error.status >= 400 && error.status < 500 && error.status !== 429) return 'unavailable';
  }
  return 'check_failed';
};

export default function JoinPairPage() {
  const router = useRouter();
  const [lookup, setLookup] = useState<PairInviteLookup | null>(null);
  const [phase, setPhase] = useState<JoinPhase>('checking');
  const [invite, setInvite] = useState<PairInviteAvailabilityDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => { if (phase !== 'checking') headingRef.current?.focus(); }, [phase]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const fragmentLookup = readLookupFromFragment();
    void Promise.resolve().then(async () => {
      if (!active) return;
      // Preserve the lookup even when the first request requires authentication.
      setLookup(fragmentLookup);
      if (!fragmentLookup) { setPhase('unavailable'); return; }
      try {
        const result = await inspectInvite(fragmentLookup, controller.signal);
        if (active) { setInvite(result.invite); setPhase(result.phase); }
      } catch (caughtError) {
        if (active) setPhase(failurePhase(caughtError instanceof Error ? caughtError : new Error('Request failed')));
      }
    });
    return () => { active = false; controller.abort(); };
  }, []);

  const refresh = async (authenticate = false) => {
    if (!lookup || busy) return;
    setBusy(true); setError(null); setConfirmed(false);
    try {
      if (authenticate) await bootstrapDiscordSession();
      const result = await inspectInvite(lookup);
      setInvite(result.invite); setPhase(result.phase);
    } catch (caughtError) {
      const nextPhase = failurePhase(caughtError instanceof Error ? caughtError : new Error('Request failed'));
      setPhase(nextPhase);
      setError(authenticate ? discordBootstrapMessage(caughtError) : 'Не удалось проверить приглашение. Попробуйте ещё раз.');
    } finally { setBusy(false); }
  };

  const acceptInvite = async () => {
    if (!lookup || !confirmed || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await pairInvitesApi.accept(lookup);
      if (result.status === 'ACCEPTED' && result.pairId) router.replace(`/pair/${encodeURIComponent(result.pairId)}`);
      else setPhase('waiting_confirmation');
    } catch (caughtError) {
      setPhase(failurePhase(caughtError instanceof Error ? caughtError : new Error('Request failed')));
      setError('Не удалось сохранить подтверждение. Проверьте приглашение и попробуйте ещё раз.');
    } finally { setBusy(false); }
  };

  const continueSetup = () => {
    if (!lookup) return;
    const fragment = new URLSearchParams({ return: 'join', ...('token' in lookup ? { token: lookup.token } : { partnerCode: lookup.partnerCode }) });
    router.push(`${phase === 'entry_required' ? '/entry' : '/mvp-onboarding'}#${fragment}`);
  };

  if (phase === 'checking') return <LoadingView label="Проверяем приглашение..." />;

  const headings: Record<Exclude<JoinPhase, 'checking'>, string> = {
    auth_required: 'Войдите через Discord', entry_required: 'Сначала — немного о вас',
    onboarding_required: 'Завершите личную настройку', available: 'Это ваш партнёр?',
    waiting_confirmation: 'Теперь подтверждает ваш партнёр', accepted: 'Ваша пара создана',
    unavailable: 'Приглашение недоступно', check_failed: 'Не удалось проверить приглашение',
  };

  return <main className="app-shell-compact app-page-stack py-3 sm:py-5">
    <BackBar title="Присоединение к паре" fallbackHref="/" />
    <section className="app-panel app-reveal space-y-4 p-4 text-slate-900 sm:p-5">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">{headings[phase]}</h1>
      {(phase === 'available' || phase === 'waiting_confirmation' || phase === 'accepted') && <ol className="grid gap-2 text-sm sm:grid-cols-3" aria-label="Этапы создания пары"><li className="app-panel-soft p-3">✓ Приглашение найдено</li><li className="app-panel-soft p-3">{phase === 'available' ? '2. Проверьте и подтвердите партнёра' : '✓ Ваше подтверждение сохранено'}</li><li className="app-panel-soft p-3">{phase === 'accepted' ? '✓ Оба подтвердили. Пара создана' : '3. Партнёр подтверждает вас'}</li></ol>}
      {phase === 'auth_required' && <><p className="app-muted text-sm">Вход нужен, чтобы безопасно проверить приглашение. Используйте собственный аккаунт.</p><button type="button" onClick={() => void refresh(true)} disabled={busy} className="app-btn-primary w-full px-4 py-2.5 disabled:opacity-60">{busy ? 'Подключаем...' : 'Войти через Discord'}</button></>}
      {(phase === 'entry_required' || phase === 'onboarding_required') && <><p className="app-muted text-sm">Выберите путь «У меня есть партнёр» и завершите короткую личную настройку. После этого вы вернётесь к приглашению. Ваши личные ответы не открываются другому автоматически.</p><button type="button" onClick={continueSetup} className="app-btn-primary w-full px-4 py-2.5">Продолжить настройку</button></>}
      {(phase === 'available' || phase === 'waiting_confirmation') && invite?.partner && <div className="app-panel-soft space-y-2 p-4"><p className="font-semibold">{invite.partner.username}</p><p className="break-all font-mono text-sm">{invite.partner.publicId}</p><p className="app-muted text-xs">Сверьте имя и код «Вместе» с человеком, с которым хотите связать аккаунты.</p></div>}
      {phase === 'available' && <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />Это мой партнёр. Я добровольно подтверждаю, что хочу создать с ним пару.</label><p className="app-muted text-sm">Партнёр увидит ваше имя и код и тоже подтвердит вас. Только после этого появится общая область пары.</p><button type="button" disabled={!confirmed || busy || !invite?.partner} onClick={() => void acceptInvite()} className="app-btn-primary w-full px-4 py-2.5 disabled:opacity-60">{busy ? 'Сохраняем...' : 'Да, это мой партнёр'}</button></>}
      {phase === 'waiting_confirmation' && <><p className="app-muted text-sm">Ваше подтверждение сохранено. Попросите партнёра открыть своё приглашение, сверить ваше имя и код и подтвердить вас.</p><button type="button" onClick={() => void refresh()} disabled={busy} className="app-btn-primary w-full px-4 py-2.5 disabled:opacity-60">Проверить подтверждение</button></>}
      {phase === 'waiting_confirmation' && <div className="app-panel-soft p-4"><h2 className="font-semibold">Пока вы ждёте</h2><p className="app-muted mt-2 text-sm">Пара ещё не создана. Личные занятия уже доступны, а к проверке можно вернуться по той же ссылке или коду.</p><Link href="/development" className="app-btn-secondary mt-3">Выбрать личное занятие</Link></div>}
      {phase === 'accepted' && <button type="button" onClick={() => router.replace(invite?.pairId ? `/pair/${encodeURIComponent(invite.pairId)}` : '/main-menu')} className="app-btn-primary w-full px-4 py-2.5">Открыть нашу пару</button>}
      {phase === 'unavailable' && <><p className="app-muted text-sm">Приглашение могло истечь, быть отменено или уже использоваться. Попросите партнёра проверить его и прислать действующий код или ссылку.</p><button type="button" onClick={() => router.push('/invite')} className="app-btn-secondary w-full px-4 py-2.5">К приглашениям</button></>}
      {phase === 'check_failed' && <button type="button" onClick={() => void refresh()} disabled={busy} className="app-btn-primary w-full px-4 py-2.5 disabled:opacity-60">Попробовать ещё раз</button>}
      {error && <div role="alert" className="app-alert app-alert-error">{error}</div>}
    </section>
  </main>;
}
