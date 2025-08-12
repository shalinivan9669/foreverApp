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
  const user = useUserStore(s => s.user);
  const [status, setStatus] = useState<PairStatus>({ hasActive: false });

  useEffect(() => {
    let isMounted = true;
    if (!user) return;
    fetch(api(`/api/pairs/status?userId=${user.id}`))
      .then(r => (r.ok ? r.json() : { hasActive: false }))
      .then((data: PairStatus) => { if (isMounted) setStatus(data); });
    return () => { isMounted = false; };
  }, [user]);

  const hasActive = status.hasActive === true;

  return (
    <Link
      href={hasActive ? '/couple-activity' : '/search'}
      className="row-span-2 col-start-1 bg-lime-200 border border-gray-400 flex items-center justify-center relative"
    >
      <div className="text-center">
        <div className="text-lg font-semibold">
          {hasActive ? 'Работа в паре' : 'Поиск пары'}
        </div>
        {hasActive && 'peer' in status && (
          <div className="mt-1 text-sm text-gray-700 flex items-center gap-2 justify-center">
            <img
              src={`https://cdn.discordapp.com/avatars/${status.peer.id}/${status.peer.avatar}.png`}
              width={20}
              height={20}
              className="rounded-full"
              alt={status.peer.username}
            />
            <span>@{status.peer.username}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
