// src/app/main-menu/page.tsx
'use client';

import { useUserStore } from '../../store/useUserStore';
import ProfileTile      from '@/components/main-menu/ProfileTile';

export default function MainMenuPage() {
  const user = useUserStore((s) => s.user);

  // пока user ещё null — показываем спиннер / Loading
  if (!user) return <div className="text-center mt-8">Loading…</div>;

  return (
    <main className="grid w-screen h-screen grid-rows-[46.5vh_7vh_46.5vh]">
      <div className="grid grid-cols-2 grid-rows-2 gap-2 p-2">
        {/* твои плитки */}
        <ProfileTile />
        {/* … */}
      </div>
      {/* остальное */}
    </main>
  );
}
