// src/components/main-menu/SearchPairTile.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { api } from '@/utils/api';

/* eslint-disable @next/next/no-img-element */

type PairStatus =
  | { hasActive: false }
  | { hasActive: true; pairKey: string; peer: { id: string; username: string; avatar: string } };

export default function SearchPairTile() {
  const user = useUserStore((s) => s.user);
  const [status, setStatus] = useState<PairStatus>({ hasActive: false });

  useEffect(() => {
    let on = true;
    if (!user) return;
    fetch(api('/api/pairs/status'))
      .then((r) => (r.ok ? r.json() : { hasActive: false }))
      .then((data: PairStatus) => {
        if (on) setStatus(data);
      });
    return () => {
      on = false;
    };
  }, [user]);

  const hasActive = status.hasActive === true;

  return (
    <Link
      href={hasActive ? '/pair' : '/search'}
      aria-label={hasActive ? 'Профиль пары' : 'Поиск пары'}
      className="
        group relative row-span-2 col-start-1
        flex items-center justify-center text-center
        rounded-2xl border border-zinc-200
        bg-gradient-to-br from-lime-100 to-emerald-50
        shadow-sm transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500
        p-2
      "
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                   bg-[radial-gradient(60%_80%_at_50%_0%,rgba(101,163,13,0.15),transparent_70%)]
                   pointer-events-none"
      />
      <div className="relative z-10">
        <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/70 shadow-sm">
          {hasActive ? (
            // иконка «пара»
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 7a5 5 0 1 1 10 0v2h1a3 3 0 1 1 0 6h-1v2a5 5 0 1 1-10 0v-2H6a3 3 0 1 1 0-6h1V7z" />
            </svg>
          ) : (
            // иконка «поиск»
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 18a8 8 0 1 1 5.293-2.707l3.707 3.707-1.414 1.414-3.707-3.707A7.963 7.963 0 0 1 10 18z" />
            </svg>
          )}
        </div>

        <div className="text-lg text-black font-semibold">
          {hasActive ? 'Профиль пары' : 'Поиск пары'}
        </div>

        {hasActive && 'peer' in status && (
          <div className="mt-1 text-sm text-zinc-700 flex items-center gap-2 justify-center">
            <img
              src={`https://cdn.discordapp.com/avatars/${status.peer.id}/${status.peer.avatar}.png`}
              width={20}
              height={20}
              className="rounded-full ring-1 ring-white/60"
              alt={status.peer.username}
            />
            <span>@{status.peer.username}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
