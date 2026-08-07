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
  const href = hasActive ? (pairId ? `/pair/${pairId}` : '/pair') : '/invite';

  return (
    <Link
      href={href}
      aria-label={hasActive ? 'Профиль пары' : 'Пригласить партнёра'}
      className="app-tile app-tile-rose app-reveal app-menu-hero group relative min-h-[13rem]"
    >
      <div className="app-tile-content">
        <div className="mb-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/85 shadow-sm sm:h-14 sm:w-14">
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

        <div className="app-tile-title mt-6">
          {hasActive ? 'Профиль пары' : 'Пригласить партнёра'}
        </div>
        <p className="app-tile-description">
          {hasActive
            ? 'Общий статус, диагностика и следующий шаг для вас двоих.'
            : 'Создайте одноразовую ссылку и безопасно подключите своего партнёра.'}
        </p>

        {hasActive && peer && (
          <div className="mt-3 flex items-center gap-2 text-sm">
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
