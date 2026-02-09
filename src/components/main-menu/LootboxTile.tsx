// src/components/main-menu/LootboxTile.tsx
import Link from 'next/link';

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      className="app-lift app-reveal flex h-full min-h-[7rem] items-center justify-center rounded-2xl border border-rose-300 bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 px-3 text-center font-semibold tracking-wide text-white shadow-[0_10px_24px_rgba(190,24,93,0.25)] transition hover:-translate-y-0.5 sm:min-h-[8rem]"
    >
      <span className="text-sm sm:text-base">ЛУТБОКСЫ</span>
    </Link>
  );
}
