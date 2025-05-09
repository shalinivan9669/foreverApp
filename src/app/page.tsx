'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { useDiscordUser } from '../context/DiscordUserContext';

export default function DiscordActivityPage() {
  const { user, setUser } = useDiscordUser();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const sdk = new DiscordSDK(process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!);
      await sdk.ready();
      const { code } = await sdk.commands.authorize({
        client_id:     process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
        response_type: 'code',
        scope:         ['identify'],
        prompt:        'none'
      });
      const tokenResp = await fetch('/.proxy/api/exchange-code', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ code })
      });
      const { access_token } = await tokenResp.json();
      await sdk.commands.authenticate({ access_token });
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      const u = await userRes.json();
      const discordUser = {
        id:       u.id,
        username: u.username,
        avatar:   u.avatar
      };
      setUser(discordUser);        // <— сохраняем в контекст
    }
    init().catch(e => setError((e as Error).message));
  }, [setUser]);

  if (error) return <p>Ошибка: {error}</p>;
  if (!user)  return <p>Loading…</p>;

  return (
    <div style={{ textAlign:'center', marginTop:20 }}>
      <Image
        src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
        width={128} height={128} alt="Avatar"
        className="rounded-full"
      />
      <h2>{user.username}</h2>
      <Link href="/main-menu">
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
          Открыть главное меню
        </button>
      </Link>
    </div>
  );
}
