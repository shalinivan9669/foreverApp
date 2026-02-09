// src/components/main-menu/ProfileTile.tsx
'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';

export default function ProfileTile() {
  const user = useUserStore((s) => s.user);

  return (
    <Link
      href="/profile"
      className="group flex h-full min-h-[7rem] items-center justify-center rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-100 via-pink-100 to-rose-100 text-slate-900 shadow-[0_10px_24px_rgba(190,24,93,0.14)] transition hover:-translate-y-0.5 sm:min-h-[8rem]"
    >
      {user ? (
        <img
          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
          alt={user.username}
          width={68}
          height={68}
          className="h-14 w-14 rounded-full ring-2 ring-white/80 shadow-md sm:h-[68px] sm:w-[68px]"
        />
      ) : (
        <span className="text-xs font-medium text-fuchsia-900 sm:text-sm">ПРОФИЛЬ</span>
      )}
    </Link>
  );
}
