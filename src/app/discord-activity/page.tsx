'use client';

import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

export default function DiscordActivityPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
      const sdk = new DiscordSDK(clientId);

      // Ждём, когда Discord установит соединение iframe ↔ SDK
      await sdk.ready();

      // Запрашиваем у пользователя право получить basic profile (identify)
      const { code } = await sdk.commands.authorize({
        client_id:     clientId,
        response_type: 'code',
        scope:         ['identify']
      });

      // Обмениваем code на access_token через наш API-роут
      const tokenResp = await fetch('/api/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const { access_token } = await tokenResp.json();

      // Передаём токен в SDK (заканчиваем авторизацию на стороне клиента)
      await sdk.commands.authenticate({ access_token });

      // Запрашиваем данные профиля у Discord API
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const user = await userRes.json();

      // Сохраняем в стейт
      setUsername(user.username);
      setAvatarUrl(`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`);
    }

    init().catch(console.error);
  }, []);

  if (!username || !avatarUrl) {
    return <div style={{ textAlign: 'center', marginTop: '2rem' }}>Loading…</div>;
  }

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      marginTop:      '2rem'
    }}>
      <img
        src={avatarUrl}
        alt="Avatar"
        style={{ width: 128, height: 128, borderRadius: '50%' }}
      />
      <h2 style={{ marginTop: '1rem' }}>{username}</h2>
    </div>
  );
}
