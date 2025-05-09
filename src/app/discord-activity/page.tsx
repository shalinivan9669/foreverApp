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
    async function init() {
      const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
      const sdk      = new DiscordSDK(clientId);

      await sdk.ready();

      // ЗАПРОС КОДА (без redirect_uri — SDK использует ваш DEV PORTAL)
      const { code } = await sdk.commands.authorize({
        client_id:     clientId,
        response_type: 'code',
        scope:         ['identify'],
        prompt:        'none'
      });

      // ОБМЕН КОД → ТОКЕН (через прокси)
      const tokenResp = await fetch('/.proxy/api/exchange-code', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code })
      });
      if (!tokenResp.ok) {
        throw new Error(`Token exchange failed: ${tokenResp.status}`);
      }
      const { access_token } = (await tokenResp.json()) as { access_token: string };

      await sdk.commands.authenticate({ access_token });

      // ПОЛУЧЕНИЕ ПРОФИЛЯ
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

  if (error) return <div style={{ color:'red', textAlign:'center' }}>Ошибка: {error}</div>;
  if (!user)  return <div style={{ textAlign:'center' }}>Loading…</div>;

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      marginTop:     '2rem'
    }}>
      <img
        src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
        width={128} height={128} style={{ borderRadius:'50%' }}
        alt="Avatar"
      />
      <h2>{user.username}</h2>
    </div>
  );
}
