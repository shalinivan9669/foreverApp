'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { isApiClientError } from '@/client/api/errors';
import { mvpOnboardingApi } from '@/client/api/mvpOnboarding.api';
import { pairInvitesApi } from '@/client/api/pairInvites.api';
import { usersApi } from '@/client/api/users.api';
import BackBar from '@/components/ui/BackBar';
import LoadingView from '@/components/ui/LoadingView';

type JoinPhase =
  | 'checking'
  | 'auth_required'
  | 'onboarding_required'
  | 'available'
  | 'unavailable'
  | 'check_failed';

const readTokenFromFragment = (): string | null => {
  if (typeof window === 'undefined') return null;
  const fragment = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const token = new URLSearchParams(fragment).get('token')?.trim();
  return token || null;
};

const isAuthRequired = (error: Error): boolean =>
  isApiClientError(error) &&
  (error.status === 401 || error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_INVALID_SESSION');

const shouldHideAsUnavailable = (error: Error): boolean =>
  isApiClientError(error) &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 401 &&
  error.status !== 429;

const isOnboardingRequired = (error: Error): boolean =>
  isApiClientError(error) && error.code === 'ONBOARDING_REQUIRED';

const resolveJoinPhase = async (
  token: string,
  signal?: AbortSignal
): Promise<JoinPhase> => {
  const invite = await pairInvitesApi.resolve(token, signal);
  if (invite.availability !== 'available') return 'unavailable';
  const onboarding = await mvpOnboardingApi.getOwnerState(signal);
  return onboarding.session?.status === 'completed'
    ? 'available'
    : 'onboarding_required';
};

const authenticateWithDiscord = async (): Promise<void> => {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error('Discord authentication is not configured');
  }

  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    scope: ['identify'],
    prompt: 'none',
  });
  const tokenData = await usersApi.exchangeDiscordCode({
    code,
    redirect_uri: redirectUri,
  });
  await sdk.commands.authenticate({ access_token: tokenData.access_token });
};

export default function JoinPairPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<JoinPhase>('checking');
  const [accepting, setAccepting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const fragmentToken = readTokenFromFragment();
    setToken(fragmentToken);
    if (!fragmentToken) {
      setPhase('unavailable');
      return;
    }

    let active = true;
    const controller = new AbortController();
    void resolveJoinPhase(fragmentToken, controller.signal)
      .then((nextPhase) => {
        if (!active) return;
        setPhase(nextPhase);
      })
      .catch((caughtError: Error) => {
        if (!active) return;
        setPhase(
          isAuthRequired(caughtError)
            ? 'auth_required'
            : shouldHideAsUnavailable(caughtError)
              ? 'unavailable'
              : 'check_failed'
        );
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const retryResolve = async () => {
    if (!token) {
      setPhase('unavailable');
      return;
    }

    setPhase('checking');
    setActionError(null);
    try {
      setPhase(await resolveJoinPhase(token));
    } catch (caughtError) {
      const error = caughtError instanceof Error ? caughtError : new Error('Request failed');
      setPhase(
        isAuthRequired(error)
          ? 'auth_required'
          : shouldHideAsUnavailable(error)
            ? 'unavailable'
            : 'check_failed'
      );
    }
  };

  const authenticateAndResolve = async () => {
    if (!token || accepting) return;
    setAccepting(true);
    setActionError(null);
    try {
      await authenticateWithDiscord();
      setPhase(await resolveJoinPhase(token));
    } catch (caughtError) {
      const error = caughtError instanceof Error ? caughtError : new Error('Request failed');
      if (shouldHideAsUnavailable(error)) {
        setPhase('unavailable');
      } else {
        setActionError(
          'Не удалось войти через Discord. Откройте ссылку внутри Discord и попробуйте ещё раз.'
        );
      }
    } finally {
      setAccepting(false);
    }
  };

  const acceptInvite = async () => {
    if (!token || accepting) return;
    setAccepting(true);
    setActionError(null);
    let attemptedDiscordAuth = false;

    try {
      let accepted;
      try {
        accepted = await pairInvitesApi.accept(token);
      } catch (caughtError) {
        const error = caughtError instanceof Error ? caughtError : new Error('Request failed');
        if (!isAuthRequired(error)) throw error;
        attemptedDiscordAuth = true;
        await authenticateWithDiscord();
        accepted = await pairInvitesApi.accept(token);
      }

      router.replace(`/pair/${encodeURIComponent(accepted.pairId)}`);
    } catch (caughtError) {
      const error = caughtError instanceof Error ? caughtError : new Error('Request failed');
      if (isOnboardingRequired(error)) {
        setPhase('onboarding_required');
      } else if (shouldHideAsUnavailable(error)) {
        setPhase('unavailable');
      } else if (attemptedDiscordAuth || isAuthRequired(error)) {
        setActionError('Не удалось войти через Discord. Откройте ссылку внутри Discord и попробуйте ещё раз.');
      } else {
        setActionError('Не удалось присоединиться. Проверьте соединение и попробуйте ещё раз.');
      }
    } finally {
      setAccepting(false);
    }
  };

  if (phase === 'checking') {
    return <LoadingView label="Проверяем приглашение..." />;
  }

  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5">
      <BackBar title="Присоединение к паре" fallbackHref="/" />

      {phase === 'auth_required' && (
        <section className="app-panel app-reveal p-4 text-center text-slate-900 sm:p-5">
          <h1 className="font-display text-2xl font-semibold">Войдите через Discord</h1>
          <p className="app-muted mt-2 text-sm leading-relaxed">
            Авторизация нужна, чтобы безопасно проверить приглашение. До входа мы не показываем
            сведения о владельце или состоянии его пары.
          </p>
          {actionError && (
            <div className="app-alert app-alert-error mt-4" role="alert">
              {actionError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void authenticateAndResolve()}
            disabled={accepting}
            className="app-btn-primary mt-4 w-full px-4 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {accepting ? 'Подключаем...' : 'Войти через Discord'}
          </button>
        </section>
      )}

      {phase === 'available' && (
        <section className="app-panel app-reveal p-4 text-slate-900 sm:p-5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-700">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 20.35l-1.45-1.32C5.4 14.36 2 11.27 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.09A5.98 5.98 0 0 1 16.5 2C19.58 2 22 4.42 22 7.5c0 3.77-3.4 6.86-8.55 11.54L12 20.35z" />
            </svg>
          </div>
          <h1 className="font-display mt-4 text-center text-2xl font-semibold">
            Вас пригласили во «Вместе»
          </h1>
          <p className="app-muted mt-2 text-center text-sm leading-relaxed">
            После входа вы сможете добровольно присоединиться к общей области пары и продолжить
            личную настройку. Личные ответы не становятся общими автоматически.
          </p>

          <div className="app-panel-soft mt-4 p-3 text-sm leading-relaxed">
            <p className="font-medium text-slate-900">Перед продолжением</p>
            <ul className="app-muted mt-2 list-disc space-y-1 pl-5">
              <li>используйте только собственный Discord-аккаунт;</li>
              <li>присоединяйтесь только по своему добровольному решению;</li>
              <li>не пересылайте эту ссылку другим людям.</li>
            </ul>
          </div>

          {actionError && (
            <div className="app-alert app-alert-error mt-4" role="alert">
              {actionError}
            </div>
          )}

          <button
            type="button"
            onClick={() => void acceptInvite()}
            disabled={accepting}
            className="app-btn-primary mt-4 w-full px-4 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {accepting ? 'Подключаем...' : 'Войти через Discord и присоединиться'}
          </button>
          <p className="app-muted mt-3 text-center text-xs">
            Владелец приглашения увидит только факт присоединения.
          </p>
        </section>
      )}

      {phase === 'onboarding_required' && token && (
        <section className="app-panel app-reveal p-4 text-center text-slate-900 sm:p-5">
          <h1 className="font-display text-2xl font-semibold">Сначала личная настройка</h1>
          <p className="app-muted mt-2 text-sm leading-relaxed">
            Подтвердите добровольное участие и выберите правила использования личных ответов.
            Ссылка останется только во фрагменте браузера и не попадёт в серверный URL.
          </p>
          <button
            type="button"
            onClick={() => {
              const fragment = new URLSearchParams({ return: 'join', token }).toString();
              router.push(`/mvp-onboarding#${fragment}`);
            }}
            className="app-btn-primary mt-4 w-full px-4 py-2.5 text-white"
          >
            Пройти личную настройку
          </button>
        </section>
      )}

      {phase === 'unavailable' && (
        <section className="app-panel app-reveal p-4 text-center text-slate-900 sm:p-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
            i
          </div>
          <h1 className="font-display mt-4 text-2xl font-semibold">Ссылка недоступна</h1>
          <p className="app-muted mt-2 text-sm leading-relaxed">
            Она могла истечь, быть отменена или уже использована. Попросите партнёра создать новую
            ссылку.
          </p>
        </section>
      )}

      {phase === 'check_failed' && (
        <section className="app-panel app-reveal p-4 text-center text-slate-900 sm:p-5">
          <h1 className="font-display text-2xl font-semibold">Не удалось проверить ссылку</h1>
          <p className="app-muted mt-2 text-sm">
            Проверьте соединение и повторите попытку. Содержимое приглашения не было раскрыто.
          </p>
          <button
            type="button"
            onClick={() => void retryResolve()}
            className="app-btn-secondary mt-4 px-4 py-2"
          >
            Повторить
          </button>
        </section>
      )}
    </main>
  );
}
