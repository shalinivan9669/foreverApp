import Link from "next/link";

export default function CoupleActivityTile() {
  return (
    <Link
      href="/couple-activity"
      aria-label="Активность пары"
      className="
        group relative flex items-center justify-center
        rounded-2xl border border-zinc-200
        bg-gradient-to-br from-amber-50 to-yellow-100
        shadow-sm transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500
        h-16 mx-2 mb-2
      "
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                      bg-[radial-gradient(60%_80%_at_50%_0%,rgba(245,158,11,0.15),transparent_70%)]" />
      <div className="relative z-10 flex items-center gap-2 font-semibold">
        {/* иконка */}
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7a5 5 0 1 1 10 0v2h1a3 3 0 1 1 0 6h-1v2a5 5 0 1 1-10 0v-2H6a3 3 0 1 1 0-6h1V7z"/></svg>
        <span>Активность пары</span>
      </div>
    </Link>
  );
}
