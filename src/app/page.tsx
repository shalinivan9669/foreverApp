'use client';

import { useEffect, useState } from 'react';
import { useRouter }          from 'next/navigation';
import { DiscordSDK }         from '@discord/embedded-app-sdk';
import { useUserStore, DiscordUser } from '../store/useUserStore';

export default function DiscordActivityPage() {
  const setUser = useUserStore((s) => s.setUser);
  const user    = useUserStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
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

    fetch('/.proxy/api/users', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(user)
    })
      .then(res => {
        if (!res.ok) console.error('DB save failed:', res.status);
        else return res.json();
      })
      .then(doc => {
        if (doc) console.log('✅ User saved to DB:', doc);
      })
      .catch(err => console.error('❌ Error saving user to DB:', err))
      .finally(() => {
        // обязательно переходим, даже если сохранение упало
        router.push('/main-menu');
      });
  };

  // 3) Рендерим
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

      <button
        onClick={goToMenu}
        className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Перейти в главное меню
      </button>
    </div>
  );
}
