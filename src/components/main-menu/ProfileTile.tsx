'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useDiscordUser } from '../../context/DiscordUserContext';

export default function ProfileTile() {
  const { user } = useDiscordUser();

  return (
    <Link href="/profile">
      <div
        className="
          w-24 h-24
          bg-pink-200 border border-gray-400
          flex items-center justify-center
          hover:bg-pink-300
        "
      >
        {user?.avatar 
          ? (
            <Image
              src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
              alt={user.username}
              width={64}
              height={64}
              className="rounded-full"
            />
          )
          : (
            <div className="text-gray-500">No Avatar</div>
          )
        }
      </div>
    </Link>
  );
}
