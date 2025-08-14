import Link from 'next/link';

export default function QuestionnaireTile() {
  return (
    <Link
      href="/questionnaires"
      aria-label="Анкетирование"
      className="
        group relative flex items-center justify-center
        rounded-2xl border border-zinc-200
        bg-gradient-to-br from-lime-50 to-emerald-100
        shadow-sm transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500
        aspect-square
      "
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                      bg-[radial-gradient(60%_80%_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]" />
      <div className="relative z-10 flex flex-col items-center gap-1">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 3h10a2 2 0 0 1 2 2v14l-4-3H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
        </svg>
        <span className="text-sm font-semibold">Анкетирование</span>
      </div>
    </Link>
  );
}
