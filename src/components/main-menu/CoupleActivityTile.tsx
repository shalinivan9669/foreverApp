// src/components/main-menu/CoupleActivityTile.tsx
import Link from 'next/link';

export default function CoupleActivityTile() {
  return (
    <Link
      href="/couple-activity"
      className="flex items-center justify-center rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-100 via-yellow-100 to-orange-100 px-3 text-center font-semibold tracking-wide text-amber-950 shadow-[0_10px_24px_rgba(146,64,14,0.12)] transition hover:-translate-y-0.5"
    >
      АКТИВНОСТЬ ПАРЫ
    </Link>
  );
}
