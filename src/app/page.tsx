'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Spinner from '@/components/ui/Spinner';
import { mvpOnboardingApi } from '@/client/api/mvpOnboarding.api';
import { usersApi } from '@/client/api/users.api';
import {
  bootstrapDiscordSession,
  discordBootstrapMessage,
} from '@/client/discord/bootstrap';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';

type DiscordProfile = {
  id: string;
  username: string;
  avatar: string;
};

export default function DiscordActivityPage() {
  const [discordUser, setDiscordUser] = useState<DiscordProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [opening, setOpening] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const didInit = useRef(false);
  const router = useRouter();
  const { refetch: refetchCurrentUser } = useCurrentUser({ enabled: false });

  const connectDiscord = useCallback(async () => {
    setConnecting(true);
    setError(null);
    setDiscordUser(null);

    try {
      const tokenData = await bootstrapDiscordSession();
      setDiscordUser(tokenData.user);
    } catch (caught) {
      setError(discordBootstrapMessage(caught));
    } finally {
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void connectDiscord();
  }, [connectDiscord]);

  const goToMenu = async () => {
    if (!discordUser || opening) return;
    setOpening(true);

    usersApi.writeActivityLog().catch(() => {});

    try {
      const me = await refetchCurrentUser();
      if (!me) throw new Error('USER_NOT_FOUND');
      const onboarding = await mvpOnboardingApi.getOwnerState();
      router.push(onboarding.session?.status === 'completed' ? '/main-menu' : '/mvp-onboarding');
    } catch {
      router.push('/mvp-onboarding');
    }
  };

  if (error) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div
          className="app-panel w-full max-w-sm p-6 text-center text-slate-900"
          role="alert"
          aria-live="polite"
        >
          <h1 className="text-lg font-semibold">Нужно переподключиться к Discord</h1>
          <p className="app-muted mt-2 text-sm">{error}</p>
          <button
            type="button"
            onClick={() => void connectDiscord()}
            disabled={connecting}
            className="app-btn-primary mt-5 px-4 py-2 text-white disabled:opacity-60"
          >
            {connecting ? 'Подключаем...' : 'Повторить подключение'}
          </button>
        </div>
      </div>
    );
  }
  if (connecting || !discordUser) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="app-panel flex items-center gap-3 px-5 py-4 text-slate-900" role="status" aria-live="polite">
          <Spinner size={28} />
          <span className="app-muted text-sm">Подключаем Discord профиль...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="app-panel flex w-full max-w-sm flex-col items-center p-6 text-slate-900">
        <div className="relative h-32 w-32">
          {!avatarLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner size={28} />
            </div>
          )}
          <Image
            src={toDiscordAvatarUrl(discordUser.id, discordUser.avatar)}
            alt={`Аватар ${discordUser.username}`}
            width={128}
            height={128}
            className="rounded-full ring-2 ring-slate-200"
            onLoad={() => setAvatarLoaded(true)}
            priority
          />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{discordUser.username}</h2>

        <button
          type="button"
          onClick={() => void goToMenu()}
          disabled={opening}
          className="app-btn-primary mt-6 px-4 py-2 text-white disabled:opacity-60"
        >
          {opening ? 'Открываем…' : 'Открыть «Вместе»'}
        </button>
      </div>
    </div>
  );
}
