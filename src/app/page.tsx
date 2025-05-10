'use client';

import { useEffect, useState } from 'react';
import { DiscordSDK }          from '@discord/embedded-app-sdk';
import { useDiscordUser, DiscordUser } from '../context/DiscordUserContext';
import Link                    from 'next/link';

export default function DiscordActivityPage() {
  const { user, setUser } = useDiscordUser();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
      const sdk      = new DiscordSDK(clientId);
      await sdk.ready();

      const { code } = await sdk.commands.authorize({
        client_id:     clientId,
        response_type: 'code',
        scope:         ['identify'],
        prompt:        'none'
      });

      const tokenResp = await fetch('/.proxy/api/exchange-code', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code })   // и redirect_uri, если ты выбрал вариант А
      });
      if (!tokenResp.ok) {
        throw new Error(`Token exchange failed: ${tokenResp.status}`);
      }

      const { access_token } = (await tokenResp.json()) as { access_token: string };
      await sdk.commands.authenticate({ access_token });

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!userRes.ok) {
        throw new Error(`Failed to fetch profile: ${userRes.status}`);
      }

      const u = (await userRes.json()) as DiscordUser;
      setUser(u);  // <-- Наконец кладём его в контекст
    }

    init().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(e);
      setError(msg);
    });
  }, [setUser]);

  if (error) return <div className="text-red-500 text-center mt-8">Ошибка: {error}</div>;
  if (!user)  return <div className="text-center mt-8">Loading…</div>;

  return (
    <div className="flex flex-col items-center mt-8">
      <img
        src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
        alt="Avatar"
        width={128}
        height={128}
        style={{ borderRadius: '50%' }}
      />
      <h2 className="mt-4 text-lg">{user.username}</h2>

      <Link href="/main-menu">
        <button className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Перейти в главное меню
        </button>
      </Link>
    </div>
  );
}
