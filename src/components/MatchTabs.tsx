'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MatchTabs() {
  const p = usePathname();
  const Item = ({ href, label }: { href: string; label: string }) => {
    const active = p.startsWith(href);
    return (
      <Link
        href={href}
        className={`px-3 mt-8 py-2 rounded ${active ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="p-3 flex gap-2 border-b">
      <Item href="/search" label="Поиск" />
      <Item href="/match/inbox" label="Потенциальные партнёры" />
    </div>
  );
}
