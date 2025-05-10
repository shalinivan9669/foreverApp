// src/app/main-menu/page.tsx
'use client';
import { useEffect } from 'react';
import { useRouter }    from 'next/navigation';
import { useDiscordUser } from '../../context/DiscordUserContext';
import ProfileTile      from '../../components/main-menu/ProfileTile';

export default function MainMenuPage() {
  const { user } = useDiscordUser();
  const router   = useRouter();

  // если контекст пуст — кидаем обратно на /
  useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [user, router]);

  if (!user) return null; // или спиннер

  return (
    <main>  
      <ProfileTile />
      {/* … */}
    </main>
  );
}
