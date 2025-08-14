'use client';

import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';

/* eslint-disable @next/next/no-img-element */

export default function ProfileTile() {
  const user = useUserStore((s) => s.user);

  return (
    <Link
      href="/profile"
      aria-label="Профиль"
      className="
        group relative flex items-center justify-center
        rounded-2xl border border-zinc-200
        bg-gradient-to-br from-pink-50 to-fuchsia-100
        shadow-sm transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500
        aspect-square h-24 md:h-auto
      "
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                      bg-[radial-gradient(60%_80%_at_50%_0%,rgba(192,38,211,0.12),transparent_70%)]" />
      <div className="relative z-10">
        {user ? (
          <img
            src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
            alt={user.username}
            width={64}
            height={64}
            className="rounded-full ring-1 ring-white/60 shadow-sm group-hover:scale-[1.03] transition-transform"
          />
        ) : (
          <span className="text-zinc-400 text-3xl">•</span>
        )}
      </div>
    </Link>
  );
}
