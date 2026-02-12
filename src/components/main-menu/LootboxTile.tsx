// src/components/main-menu/LootboxTile.tsx
import Link from 'next/link';

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      className="app-tile app-tile-spark app-reveal flex h-full min-h-[7rem] flex-col items-center justify-center px-3 text-center sm:min-h-[8rem]"
    >
      <span className="font-display text-base font-semibold leading-tight sm:text-lg">ЛУТБОКСЫ</span>
      <span className="font-accent mt-1 rounded-full bg-white/20 px-2 py-0.5 text-sm text-white/95">событие дня</span>
    </Link>
  );
}
