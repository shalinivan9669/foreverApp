// src/components/profile/UserHeader.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';

type UserHeaderProps = {
  user: {
    id: string;
    handle: string;
    avatar: string | null;
    status: 'solo:new' | 'solo:history' | 'paired';
  };
  pair: { id: string; status: string } | null;
};

export default function UserHeader({ user, pair }: UserHeaderProps) {
  return (
    <header className="app-panel app-panel-solid app-reveal flex flex-wrap items-center gap-3 p-4">
      <Image
        src={user.avatar ?? 'https://cdn.discordapp.com/embed/avatars/0.png'}
        alt={user.handle}
        width={48}
        height={48}
        className="rounded-full ring-1 ring-white/80"
      />

      <div className="min-w-0 flex-1">
        <div className="font-display truncate text-xl font-bold leading-tight">@{user.handle}</div>
        <div className="app-muted text-sm">
          Статус: {user.status}
          {pair && (
            <>
              {' • '}
              <Link href={`/pair/${pair.id}`} className="underline">
                Моя пара
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="hidden flex-wrap gap-2 text-sm md:flex">
        <Link href="/profile" className="app-btn-secondary px-3 py-1.5 text-xs sm:text-sm">
          Обзор
        </Link>
        <Link href="/profile/profile" className="app-btn-secondary px-3 py-1.5 text-xs sm:text-sm">
          Профиль
        </Link>
        <Link href="/profile/activities" className="app-btn-secondary px-3 py-1.5 text-xs sm:text-sm">
          Активности
        </Link>
        <Link href="/profile/matching" className="app-btn-secondary px-3 py-1.5 text-xs sm:text-sm">
          Матчинг
        </Link>
        <Link href="/profile/history" className="app-btn-secondary px-3 py-1.5 text-xs sm:text-sm">
          История
        </Link>
        <Link href="/profile/settings" className="app-btn-secondary px-3 py-1.5 text-xs sm:text-sm">
          Настройки
        </Link>
      </nav>
    </header>
  );
}
