'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { PublicUserDTO } from '@/client/api/types';

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
      className="
        group relative row-span-2 col-start-1
        flex items-center justify-center text-center
        rounded-2xl border border-emerald-200
        bg-gradient-to-br from-lime-100 via-emerald-100 to-teal-100
        shadow-[0_12px_28px_rgba(21,128,61,0.15)] transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(21,128,61,0.2)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600
        p-2 text-emerald-950
      "
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-100
                   bg-[radial-gradient(60%_80%_at_50%_0%,rgba(21,128,61,0.18),transparent_72%)]"
      />
      <div className="relative z-10">
        <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 shadow-sm">
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

        <div className="text-lg font-semibold">{hasActive ? 'Профиль пары' : 'Поиск пары'}</div>

        {hasActive && peer && (
          <div className="mt-1 flex items-center justify-center gap-2 text-sm text-emerald-900">
            <Image
              src={`https://cdn.discordapp.com/avatars/${peer.id}/${peer.avatar}.png`}
              width={20}
              height={20}
              className="rounded-full ring-1 ring-white/60"
              alt={peer.username}
            />
            <span>@{peer.username}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
