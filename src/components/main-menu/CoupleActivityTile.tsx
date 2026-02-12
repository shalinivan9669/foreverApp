// src/components/main-menu/CoupleActivityTile.tsx
import Link from 'next/link';

export default function CoupleActivityTile() {
  return (
    <Link
      href="/couple-activity"
      className="app-tile app-tile-aura app-reveal flex h-full min-h-[7rem] items-center justify-center px-3 text-center sm:min-h-[8rem]"
    >
      <span className="font-display text-sm font-semibold leading-tight sm:text-base">АКТИВНОСТЬ ПАРЫ</span>
    </Link>
  );
}
