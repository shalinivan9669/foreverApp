import Link from "next/link";

export default function LootboxTile() {
  return (
    <Link
      href="/lootboxes"
      aria-label="Лутбоксы"
      className="
        group relative flex items-center justify-center
        rounded-2xl border border-zinc-200
        bg-gradient-to-br from-rose-50 to-red-100
        shadow-sm transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500
        h-16 mx-2 mb-2
      "
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200
                      bg-[radial-gradient(60%_80%_at_50%_0%,rgba(225,29,72,0.12),transparent_70%)]" />
      <div className="relative z-10 flex items-center gap-2 font-semibold">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 7h18l-2 12H5L3 7zm3-3h12l2 3H4l2-3z"/></svg>
        <span>Лутбоксы</span>
      </div>
    </Link>
  );
}
