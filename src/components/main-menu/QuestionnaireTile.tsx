// src/components/main-menu/QuestionnaireTile.tsx
import Link from 'next/link';

export default function QuestionnaireTile() {
  return (
    <Link
      href="/questionnaires"
      className="app-tile app-tile-mint app-reveal app-menu-tile min-h-[11rem]"
    >
      <div className="app-tile-content">
        <span className="app-tile-title">Анкеты</span>
        <span className="app-tile-description">Короткие вопросы, которые превращаются в полезные наблюдения.</span>
      </div>
    </Link>
  );
}
