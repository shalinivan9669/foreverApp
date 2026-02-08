// src/components/profile/UserHeader.tsx
'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function UserHeader({ user, pair }: {
  user: { id: string; handle: string; avatar: string | null; status: 'solo:new'|'solo:history'|'paired' };
  pair: { id: string; status: string } | null;
}) {
  return (
    <header className="border rounded p-4 flex items-center gap-3">
      <Image
        src={user.avatar ?? 'https://cdn.discordapp.com/embed/avatars/0.png'}
        alt={user.handle}
        width={48}
        height={48}
        className="rounded-full ring-1 ring-zinc-200"
      />
      <div className="flex-1">
        <div className="font-semibold">@{user.handle}</div>
        <div className="text-sm text-gray-600">
          РЎС‚Р°С‚СѓСЃ: {user.status}
          {pair && (
            <>
              {' В· '}
              <Link href={`/pair/${pair.id}`} className="text-blue-600 hover:underline">РњРѕСЏ РїР°СЂР°</Link>
            </>
          )}
        </div>
      </div>
      <nav className="hidden md:flex gap-2 text-sm">
        <Link href="/profile" className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200">РћР±Р·РѕСЂ</Link>
        <Link href="/profile/profile" className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200">РџСЂРѕС„РёР»СЊ</Link>
        <Link href="/profile/activities" className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200">РђРєС‚РёРІРЅРѕСЃС‚Рё</Link>
        <Link href="/profile/matching" className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200">РњР°С‚С‡РёРЅРі</Link>
        <Link href="/profile/history" className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200">РСЃС‚РѕСЂРёСЏ</Link>
        <Link href="/profile/settings" className="px-3 py-1 rounded bg-zinc-100 hover:bg-zinc-200">РќР°СЃС‚СЂРѕР№РєРё</Link>
      </nav>
    </header>
  );
}
