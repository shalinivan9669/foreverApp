// src/components/main-menu/LootboxTile.tsx
import Link from 'next/link';

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      className="flex items-center justify-center rounded-2xl border border-rose-300 bg-gradient-to-br from-rose-500 via-red-500 to-orange-500 px-3 text-center font-semibold tracking-wide text-white shadow-[0_10px_24px_rgba(190,24,93,0.25)] transition hover:-translate-y-0.5"
    >
      Р вЂєР Р€Р СћР вЂР С›Р С™Р РЋР В«
    </Link>
  );
}
