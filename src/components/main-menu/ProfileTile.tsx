// src/components/main-menu/ProfileTile.tsx
'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useCurrentUser } from '@/client/hooks/useCurrentUser';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';

export default function ProfileTile() {
  const { data: user } = useCurrentUser();

  return (
    <Link
      href="/profile"
      className="group app-tile app-tile-plum app-reveal app-menu-tile min-h-[11rem]"
    >
      <div className="app-tile-content">
        {user && (
          <Image
            src={toDiscordAvatarUrl(user.id, user.avatar)}
            alt={user.username}
            width={68}
            height={68}
            className="mb-auto h-14 w-14 rounded-full ring-2 ring-white/85 shadow-md sm:h-[68px] sm:w-[68px]"
          />
        )}
        <span className="app-tile-title mt-5">Мой профиль</span>
        <span className="app-tile-description">Состояние, вклад и личные ориентиры.</span>
      </div>
    </Link>
  );
}
