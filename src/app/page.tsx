'use client';

import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

//
// 1. Определяем интерфейс для данных пользователя
//
interface DiscordUser {
  id: string;
  username: string;
  avatar: string;
  discriminator: string;
  // при необходимости можно добавить другие поля из API /users/@me
}

export default function DiscordActivityPage() {
  //
  // 2. useState с конкретным типом вместо any
  //
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init(): Promise<void> {
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
      const sdk      = new DiscordSDK(clientId);

      await sdk.ready();

      // запрашиваем разрешение
      const { code } = await sdk.commands.authorize({
        client_id:     clientId,
        response_type: 'code',
        scope:         ['identify'],
        prompt:        'none'
      });

      // обмениваем code → access_token через прокси
      const tokenResp = await fetch('/.proxy/api/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (!tokenResp.ok) {
        throw new Error(`Token exchange failed: ${tokenResp.status}`);
      }
      const { access_token } = await tokenResp.json() as { access_token: string };

      // передаём токен в SDK
      await sdk.commands.authenticate({ access_token });

      // получаем профиль пользователя
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      if (!userRes.ok) {
        throw new Error(`Failed to fetch user profile: ${userRes.status}`);
      }
      const userData = (await userRes.json()) as DiscordUser;

      setUser(userData);
    }

    // 3. Ловим ошибку с типом unknown
    init().catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      console.error(e);
    });
  }, []);

  if (error) {
    return (
      <div style={{ color: 'red', textAlign: 'center', marginTop: '2rem' }}>
        Ошибка: {error}
      </div>
    );
  }
  if (!user) {
    return <div style={{ textAlign: 'center', marginTop: '2rem' }}>Loading…</div>;
  }

  return (
    <div
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        marginTop:      '2rem'
      }}
    >
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
