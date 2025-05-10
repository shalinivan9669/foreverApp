'use client';

import Link             from 'next/link';
import { useUserStore } from '@/store/useUserStore';

export default function ProfileTile() {
  // читаем user из Zustand-стора
  const user = useUserStore((s) => s.user);

  return (
    <Link
      href="/profile"
      className="
        w-24 h-24
        bg-pink-200 border border-gray-400
        flex items-center justify-center
        hover:bg-pink-300
      "
    >
      {user ? (
        // если user есть, рисуем аватар
        <img
          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
          alt={user.username}
          width={64}
          height={64}
          style={{ borderRadius: '50%' }}
        />
      ) : (
        // иначе показываем placeholder
        <span className="text-gray-500">–</span>
      )}
    </Link>
  );
}
