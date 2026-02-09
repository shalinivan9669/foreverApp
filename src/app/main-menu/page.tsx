'use client';

import SearchPairTile from '@/components/main-menu/SearchPairTile';
import ProfileTile from '@/components/main-menu/ProfileTile';
import QuestionnaireTile from '@/components/main-menu/QuestionnaireTile';
import LootboxTile from '@/components/main-menu/LootboxTile';
import CoupleActivityTile from '@/components/main-menu/CoupleActivityTile';

export default function MainMenuPage() {
  return (
    <main className="app-shell py-3 sm:py-4 lg:py-6">
      <div className="grid min-h-[calc(100dvh-1.5rem)] grid-cols-1 gap-3 sm:gap-4 sm:min-h-[calc(100dvh-2rem)] md:min-h-[min(780px,calc(100dvh-2.5rem))] md:auto-rows-fr md:grid-cols-[1.35fr_1fr]">
        <div className="grid min-h-[18rem] grid-cols-2 grid-rows-2 gap-3 sm:min-h-[22rem] sm:gap-4 md:row-span-2">
          <SearchPairTile />
          <ProfileTile />
          <QuestionnaireTile />
        </div>

        <LootboxTile />
        <CoupleActivityTile />
      </div>
    </main>
  );
}
