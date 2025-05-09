'use client';

import { useEffect, useState } from 'react';
import { DiscordSDK }         from '@discord/embedded-app-sdk';

interface DiscordUser {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
}

export default function DiscordActivityPage() {
  const [user,  setUser]  = useState<DiscordUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init(): Promise<void> {
      const clientId   = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
      const redirectUri = process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI!;
      const sdk        = new DiscordSDK(clientId);

      // 1) Устанавливаем связь с Discord
      await sdk.ready();

      // 2) Запрашиваем код, обязательно передаём redirect_uri
      const { code } = await sdk.commands.authorize({
        client_id:     clientId,
        response_type: 'code',
        scope:         ['identify'],
        prompt:        'none'
      });

      // 3) Обмениваем код → токен, через прокси
      const tokenResp = await fetch('/.proxy/api/exchange-code', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code, redirect_uri: redirectUri })
      });
      if (!tokenResp.ok) {
        throw new Error(`Token exchange failed: ${tokenResp.status}`);
      }
      const { access_token } = (await tokenResp.json()) as { access_token: string };

      // 4) Завершаем авторизацию в SDK
      await sdk.commands.authenticate({ access_token });

      // 5) Запрашиваем профиль пользователя
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!userRes.ok) {
        throw new Error(`Failed to fetch profile: ${userRes.status}`);
      }
      const userData = (await userRes.json()) as DiscordUser;

      setUser(userData);
    }

    init().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(e);
      setError(msg);
    });
  }, []);

  if (error) {
    return (
      <div style={{ color: 'red', textAlign: 'center', marginTop: '2rem' }}>
        Ошибка:2222 {error}
      </div>
    );
  }
  if (!user) {
    return <div style={{ textAlign: 'center', marginTop: '2rem' }}>2222Loading…</div>;
  }

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      marginTop:      '2rem'
    }}>
      <img
        src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
        alt="Avatar"
        width={128}
        height={128}
        style={{ borderRadius: '50%' }}
      />
      <h2 style={{ marginTop: '1rem' }}>{user.username}</h2>
    </div>
  );
}
