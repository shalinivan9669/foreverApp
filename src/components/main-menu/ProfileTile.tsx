// src/components/main-menu/ProfileTile.tsx
'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';

export default function ProfileTile() {
  const { data: user } = useCurrentUser();

  return (
    <Link
      href="/profile"
      className="group app-tile app-tile-plum app-reveal flex h-full min-h-[7rem] items-center justify-center sm:min-h-[8rem]"
    >
      {user ? (
        <img
          src={toDiscordAvatarUrl(user.id, user.avatar)}
          alt={user.username}
          width={68}
          height={68}
          className="h-14 w-14 rounded-full ring-2 ring-white/85 shadow-md sm:h-[68px] sm:w-[68px]"
        />
      ) : (
        <span className="font-display text-xs font-semibold leading-tight sm:text-sm">ПРОФИЛЬ</span>
      )}
    </Link>
  );
}
