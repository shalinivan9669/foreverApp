
// src/app/main-menu/page.tsx
'use client';
 
import SearchPairTile from "@/components/main-menu/SearchPairTile";
import ProfileTile from "@/components/main-menu/ProfileTile";
import QuestionnaireTile from "@/components/main-menu/QuestionnaireTile";
import LootboxTile from "@/components/main-menu/LootboxTile";
import CoupleActivityTile from "@/components/main-menu/CoupleActivityTile";

 

import { useUserStore } from '@/store/useUserStore';

export default function MainMenuPage() {
  const user = useUserStore((s) => s.user);

  // пока нет user — можно отрисовать спиннер или ничего
  if (!user) return <div className="text-center mt-8">Loading…</div>;

  return (
    <main className="grid w-screen h-screen grid-rows-[46.5vh_7vh_46.5vh]">
     <div className="grid grid-cols-2 grid-rows-2 gap-x-5 gap-y-2 p-2">
        <SearchPairTile />
        <ProfileTile />
        <QuestionnaireTile />
      </div>
      <LootboxTile />
      <CoupleActivityTile />
    </main>
  );
}
