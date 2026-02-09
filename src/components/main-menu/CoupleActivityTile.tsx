// src/components/main-menu/CoupleActivityTile.tsx
import Link from 'next/link';

export default function CoupleActivityTile() {
  return (
    <Link
      href="/couple-activity"
      className="app-lift app-reveal flex h-full min-h-[7rem] items-center justify-center rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-100 via-yellow-100 to-orange-100 px-3 text-center font-semibold tracking-wide text-amber-950 shadow-[0_10px_24px_rgba(146,64,14,0.12)] transition hover:-translate-y-0.5 sm:min-h-[8rem]"
    >
      <span className="text-sm sm:text-base">АКТИВНОСТЬ ПАРЫ</span>
    </Link>
  );
}
