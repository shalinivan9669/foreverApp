// src/components/main-menu/LootboxTile.tsx
import Link from 'next/link';

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      className="app-tile app-tile-spark app-reveal app-menu-tile min-h-[11rem]"
    >
      <div className="app-tile-content">
        <span className="mb-auto w-fit rounded-full bg-white/20 px-3 py-1 text-sm text-white/95">Событие дня</span>
        <span className="app-tile-title mt-5">Лутбоксы</span>
        <span className="app-tile-description text-white/90">Небольшой совместный сюрприз для смены ритма.</span>
      </div>
    </Link>
  );
}
