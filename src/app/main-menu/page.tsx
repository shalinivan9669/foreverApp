'use client';

import SearchPairTile from '@/components/main-menu/SearchPairTile';
import ProfileTile from '@/components/main-menu/ProfileTile';
import QuestionnaireTile from '@/components/main-menu/QuestionnaireTile';
import LootboxTile from '@/components/main-menu/LootboxTile';
import CoupleActivityTile from '@/components/main-menu/CoupleActivityTile';

export default function MainMenuPage() {
  return (
    <main className="app-shell-menu py-3 sm:py-5 lg:py-7">
      <div className="app-menu-grid">
        <SearchPairTile />
        <ProfileTile />
        <QuestionnaireTile />
        <LootboxTile />
        <CoupleActivityTile />
      </div>
    </main>
  );
}
