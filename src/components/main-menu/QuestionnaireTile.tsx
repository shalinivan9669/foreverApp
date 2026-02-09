// src/components/main-menu/QuestionnaireTile.tsx
import Link from 'next/link';

export default function QuestionnaireTile() {
  return (
    <Link
      href="/questionnaires"
      className="app-tile app-tile-honey app-reveal flex h-full min-h-[7rem] items-center justify-center px-3 text-center font-semibold tracking-wide sm:min-h-[8rem]"
    >
      <span className="text-sm sm:text-base">АНКЕТИРОВАНИЕ</span>
    </Link>
  );
}
