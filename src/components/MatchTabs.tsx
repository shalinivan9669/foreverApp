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
        className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
          active
            ? 'app-btn-primary text-white'
            : 'app-btn-secondary text-slate-800'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="app-panel-soft flex gap-2 p-3">
      <Item href="/search" label="Р СџР С•Р С‘РЎРѓР С”" />
      <Item href="/match/inbox" label="Р СџР С•РЎвЂљР ВµР Р…РЎвЂ Р С‘Р В°Р В»РЎРЉР Р…РЎвЂ№Р Вµ Р С—Р В°РЎР‚РЎвЂљР Р…РЎвЂРЎР‚РЎвЂ№" />
    </div>
  );
}
