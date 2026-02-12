// src/components/main-menu/QuestionnaireTile.tsx
import Link from 'next/link';

export default function QuestionnaireTile() {
  return (
    <Link
      href="/questionnaires"
      className="app-tile app-tile-mint app-reveal flex h-full min-h-[7rem] items-center justify-center px-3 text-center sm:min-h-[8rem]"
    >
      <span className="font-display text-sm font-semibold leading-tight sm:text-base">АНКЕТИРОВАНИЕ</span>
    </Link>
  );
}
