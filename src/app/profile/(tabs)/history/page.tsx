// src/app/profile/(tabs)/history/page.tsx
'use client';

import Link from 'next/link';

export default function ProfileHistoryTab() {
  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">История</h1>
        <Link href="/profile" className="text-sm underline">
          К обзору
        </Link>
      </div>

      <div className="app-panel p-4">
        <p className="app-muted">Пары, активности и логи (будет позже).</p>
      </div>
    </main>
  );
}
