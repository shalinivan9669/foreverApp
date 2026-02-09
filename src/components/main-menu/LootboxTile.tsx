// src/components/main-menu/LootboxTile.tsx
import Link from 'next/link';

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      className="app-tile app-tile-spark app-reveal flex h-full min-h-[7rem] items-center justify-center px-3 text-center font-semibold tracking-wide sm:min-h-[8rem]"
    >
      <span className="text-sm sm:text-base">ЛУТБОКСЫ</span>
    </Link>
  );
}
