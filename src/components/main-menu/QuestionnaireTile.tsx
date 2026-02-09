// src/components/main-menu/QuestionnaireTile.tsx
import Link from 'next/link';

export default function QuestionnaireTile() {
  return (
    <Link
      href="/questionnaires"
      className="flex h-full min-h-[7rem] items-center justify-center rounded-2xl border border-lime-200 bg-gradient-to-br from-lime-100 via-emerald-100 to-teal-100 px-3 text-center font-semibold tracking-wide text-emerald-950 shadow-[0_10px_24px_rgba(21,128,61,0.14)] transition hover:-translate-y-0.5 sm:min-h-[8rem]"
    >
      <span className="text-sm sm:text-base">АНКЕТИРОВАНИЕ</span>
    </Link>
  );
}
