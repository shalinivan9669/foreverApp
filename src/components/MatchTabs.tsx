'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type MatchTabItemProps = {
  pathname: string;
  href: string;
  label: string;
};

function MatchTabItem({ pathname, href, label }: MatchTabItemProps) {
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
}

export default function MatchTabs() {
  const pathname = usePathname();

  return (
    <div className="app-panel-soft app-reveal flex flex-wrap items-center gap-2 p-2.5 sm:p-3">
      <MatchTabItem pathname={pathname} href="/search" label="Поиск" />
      <MatchTabItem
        pathname={pathname}
        href="/match/inbox"
        label="Потенциальные партнеры"
      />
    </div>
  );
}
