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
      className="group app-tile app-tile-blush app-reveal flex h-full min-h-[7rem] items-center justify-center sm:min-h-[8rem]"
    >
      {user ? (
        <img
          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
          alt={user.username}
          width={68}
          height={68}
          className="h-14 w-14 rounded-full ring-2 ring-white/85 shadow-md sm:h-[68px] sm:w-[68px]"
        />
      ) : (
        <span className="text-xs font-medium sm:text-sm">ПРОФИЛЬ</span>
      )}
    </Link>
  );
}
