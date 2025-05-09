'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface DiscordUser {
  id: string;
  username: string;
  avatar: string;
}

export default function DiscordActivityPage() {
  const [user, setUser] = useState<DiscordUser| null>(null);
  const [err, setErr]  = useState<string| null>(null);

  useEffect(() => {
    async function init() {
      try {
        const response = await fetch('/api/discord-user');
        const data: DiscordUser = await response.json();
        setUser(data);
      } catch (error) {
        throw error;
      }
    }
    init().catch(e => setErr((e as Error).message));
  }, []);

  if (err)   return <p>Ошибка: {err}</p>;
  if (!user) return <p>Loading…</p>;

  return (
    <div style={{ textAlign: 'center', marginTop: 20 }}>
      <Image
        src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
        width={128} height={128} alt="Avatar"
        className="rounded-full"
      />
      <h2>{user.username}</h2>

      {/* вот наша кнопка для перехода */}
      <Link href="/main-menu">
        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Открыть главное меню
        </button>
      </Link>
    </div>
  );
}
