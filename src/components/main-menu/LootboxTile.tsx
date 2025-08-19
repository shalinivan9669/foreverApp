// src/components/main-menu/LootboxTile.tsx
import Link from 'next/link';

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      className="bg-red-600 border border-gray-400 flex items-center justify-center"
    >
      ЛУТБОКСЫ
    </Link>
  );
}
