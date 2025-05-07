import SearchPairTile from "@/components/main-menu/SearchPairTile";
import ProfileTile from "@/components/main-menu/ProfileTile";
import QuestionnaireTile from "@/components/main-menu/QuestionnaireTile";
import LootboxTile from "@/components/main-menu/LootboxTile";
import CoupleActivityTile from "@/components/main-menu/CoupleActivityTile";

export default function Home() {
  return (
    <main className="grid w-screen h-screen grid-rows-[46.5vh_7vh_46.5vh]">
      {/* Верхняя часть */}
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
