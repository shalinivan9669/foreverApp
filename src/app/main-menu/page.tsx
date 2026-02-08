'use client';

import SearchPairTile from '@/components/main-menu/SearchPairTile';
import ProfileTile from '@/components/main-menu/ProfileTile';
import QuestionnaireTile from '@/components/main-menu/QuestionnaireTile';
import LootboxTile from '@/components/main-menu/LootboxTile';
import CoupleActivityTile from '@/components/main-menu/CoupleActivityTile';

export default function MainMenuPage() {
  return (
    <main className="mx-auto grid h-dvh w-full max-w-md grid-rows-[46%_24%_24%] gap-3 p-3">
      <div className="grid grid-cols-2 grid-rows-2 gap-3">
        <SearchPairTile />
        <ProfileTile />
        <QuestionnaireTile />
      </div>

      <LootboxTile />
      <CoupleActivityTile />
    </main>
  );
}
