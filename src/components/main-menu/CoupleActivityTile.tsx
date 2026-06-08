// src/components/main-menu/CoupleActivityTile.tsx
import Link from 'next/link';

export default function CoupleActivityTile() {
  return (
    <Link
      href="/couple-activity"
      className="app-tile app-tile-aura app-reveal app-menu-tile min-h-[11rem]"
    >
      <div className="app-tile-content">
        <span className="app-tile-title">Активности пары</span>
        <span className="app-tile-description">Текущая задача, новые предложения и история ваших шагов.</span>
      </div>
    </Link>
  );
}
