'use client';

import { useEffect, useState } from 'react';
import { useRouter }          from 'next/navigation';
import Image                 from 'next/image';
import { DiscordSDK }         from '@discord/embedded-app-sdk';
import { useUserStore, DiscordUser } from '../store/useUserStore';
import Spinner               from '@/components/ui/Spinner';

export default function DiscordActivityPage() {
  const setUser = useUserStore((s) => s.setUser);
  const user    = useUserStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const router = useRouter();

  // 1) Авторизуем пользователя в Discord, кладём в Zustand
  useEffect(() => {
    async function init() {
      try {
        const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
        const sdk      = new DiscordSDK(clientId);
        await sdk.ready();

        // получаем код
        const { code } = await sdk.commands.authorize({
          client_id:     clientId,
          response_type: 'code',
          scope:         ['identify'],
          prompt:        'none'
        });

        // обмениваем код на токен
        const tokenResp = await fetch('/.proxy/api/exchange-code', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            code,
            redirect_uri: process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!
          })
        });
        if (!tokenResp.ok) {
          throw new Error(`Token exchange failed: ${tokenResp.status}`);
        }
        const { access_token } = (await tokenResp.json()) as { access_token: string };
        await sdk.commands.authenticate({ access_token });

        // получаем профиль
        const userRes = await fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        if (!userRes.ok) {
          throw new Error(`Failed to fetch profile: ${userRes.status}`);
        }
        const u = (await userRes.json()) as DiscordUser;

        // сохраняем локально
        setUser(u);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(e);
        setError(msg);
      }
    }
    init();
  }, [setUser]);

  // 2) Обработчик кнопки: сначала fire-and-forget запись в БД, потом переход
 
  const goToMenu = () => {
    if (!user) return;

    // Log visit (fire and forget)
    fetch('/.proxy/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    }).catch(() => {});

    fetch(`/.proxy/api/users/${user.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        const onboarding = doc?.profile?.onboarding;
        if (onboarding?.seeking || onboarding?.inRelationship) {
          router.push('/main-menu');
        } else {
          router.push('/welcome');
        }
      })
      .catch(() => router.push('/welcome'));
  };


  // 3) Render
  if (error) return <div className="text-red-500 text-center mt-8">Error: {error}</div>;
  if (!user) {
    return (
      <div className="flex items-center justify-center mt-16">
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center mt-8">
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
          className="rounded-full"
          onLoad={() => setAvatarLoaded(true)}
          priority
        />
      </div>
      <h2 className="mt-4 text-lg">{user.username}</h2>

      <button
        onClick={goToMenu}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Go to main menu
      </button>
    </div>
  );
}
