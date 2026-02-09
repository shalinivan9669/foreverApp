'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MatchTabs() {
  const pathname = usePathname();

  const Item = ({ href, label }: { href: string; label: string }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm ${
          active ? 'app-btn-primary text-white' : 'app-btn-secondary text-slate-800'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="app-panel-soft app-reveal flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
      <Item href="/search" label="Поиск" />
      <Item href="/match/inbox" label="Потенциальные партнеры" />
    </div>
  );
}
