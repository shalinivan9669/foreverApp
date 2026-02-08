'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { useUserStore, DiscordUser } from '../store/useUserStore';
import Spinner from '@/components/ui/Spinner';
import { usersApi } from '@/client/api/users.api';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';

export default function DiscordActivityPage() {
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const didInit = useRef(false);
  const router = useRouter();
  const { refetch: refetchCurrentUser } = useCurrentUser({ enabled: false });

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    async function init() {
      try {
        const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
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
          redirect_uri: process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!,
        });

        await sdk.commands.authenticate({ access_token: tokenData.access_token });

        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userRes.ok) {
          throw new Error(`Failed to fetch profile: ${userRes.status}`);
        }
        const u = (await userRes.json()) as DiscordUser;

        setUser(u);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(e);
        setError(msg);
      }
    }

    init();
  }, [setUser]);

  const goToMenu = async () => {
    if (!user) return;

    usersApi.writeActivityLog().catch(() => {});

    try {
      const me = await refetchCurrentUser();
      if (!me) throw new Error('USER_NOT_FOUND');
      const onboarding = me.profile?.onboarding;

      if (onboarding?.seeking || onboarding?.inRelationship) {
        router.push('/main-menu');
      } else {
        router.push('/welcome');
      }
    } catch {
      router.push('/welcome');
    }
  };

  if (error) return <div className="text-red-500 text-center mt-8">Error: {error}</div>;
  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="app-panel flex items-center gap-3 px-5 py-4 text-slate-900">
          <Spinner size={28} />
          <span className="app-muted text-sm">РџРѕРґРєР»СЋС‡Р°РµРј Discord РїСЂРѕС„РёР»СЊвЂ¦</span>
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
            src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
            alt="Avatar"
            width={128}
            height={128}
            className="rounded-full ring-2 ring-slate-200"
            onLoad={() => setAvatarLoaded(true)}
            priority
          />
        </div>
        <h2 className="mt-4 text-lg font-semibold">{user.username}</h2>

        <button
          onClick={goToMenu}
          className="app-btn-primary mt-6 px-4 py-2 text-white"
        >
          Go to main menu
        </button>
      </div>
    </div>
  );
}
