// src/components/main-menu/ProfileTile.tsx
'use client';

import Link from 'next/link';
import { useDiscordUser } from '../../context/DiscordUserContext';

export default function ProfileTile() {
  const { user } = useDiscordUser();

  return (
    <Link href="/profile">
      <div className="
        w-24 h-24
        bg-pink-200 border border-gray-400
        flex items-center justify-center
        hover:bg-pink-300
      ">
        {user ? (
         <img
         src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
         alt="Avatar"
         width={128}
         height={128}
         style={{ borderRadius: '50%' }}
       />
        ) : (
          <span className="text-gray-500">–</span>
        )}
      </div>
    </Link>
  );
}
