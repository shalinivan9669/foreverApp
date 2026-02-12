'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { PublicUserDTO } from '@/client/api/types';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';

type SearchPairTileViewProps = {
  hasActive: boolean;
  pairId?: string;
  peer?: PublicUserDTO;
};

export default function SearchPairTileView({ hasActive, pairId, peer }: SearchPairTileViewProps) {
  const href = hasActive ? (pairId ? `/pair/${pairId}` : '/pair') : '/search';

  return (
    <Link
      href={href}
      aria-label={hasActive ? 'Профиль пары' : 'Поиск пары'}
      className="app-tile app-tile-rose app-reveal group relative col-start-1 row-span-2 flex h-full min-h-[10rem] items-center justify-center p-2 text-center sm:min-h-[12rem]"
    >
      <div className="relative z-10">
        <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 shadow-sm sm:h-10 sm:w-10">
          {hasActive ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 7a5 5 0 1 1 10 0v2h1a3 3 0 1 1 0 6h-1v2a5 5 0 1 1-10 0v-2H6a3 3 0 1 1 0-6h1V7z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 18a8 8 0 1 1 5.293-2.707l3.707 3.707-1.414 1.414-3.707-3.707A7.963 7.963 0 0 1 10 18z" />
            </svg>
          )}
        </div>

        <div className="font-display text-base font-semibold leading-tight sm:text-lg">
          {hasActive ? 'Профиль пары' : 'Поиск пары'}
        </div>

        {hasActive && peer && (
          <div className="mt-1 flex items-center justify-center gap-2 text-xs sm:text-sm">
            <Image
              src={toDiscordAvatarUrl(peer.id, peer.avatar)}
              width={20}
              height={20}
              className="rounded-full ring-1 ring-white/75"
              alt={peer.username}
            />
            <span>@{peer.username}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
