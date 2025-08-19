// src/components/main-menu/CoupleActivityTile.tsx
import Link from 'next/link';

export default function CoupleActivityTile() {
  return (
    <Link
      href="/couple-activity"
      className="bg-yellow-200 border border-gray-400 flex items-center justify-center"
    >
      АКТИВНОСТЬ ПАРЫ
    </Link>
  );
}
