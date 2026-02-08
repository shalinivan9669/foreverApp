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
      className="group flex min-h-0 items-center justify-center rounded-2xl border border-fuchsia-200 bg-gradient-to-br from-fuchsia-100 via-pink-100 to-rose-100 text-slate-900 shadow-[0_10px_24px_rgba(190,24,93,0.14)] transition hover:-translate-y-0.5"
    >
      {user ? (
        <img
          src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
          alt={user.username}
          width={68}
          height={68}
          className="rounded-full ring-2 ring-white/80 shadow-md"
        />
      ) : (
        <span className="text-sm font-medium text-fuchsia-900">Р СџРЎР‚Р С•РЎвЂћР С‘Р В»РЎРЉ</span>
      )}
    </Link>
  );
}
