// src/app/profile/(tabs)/profile/page.tsx
'use client';

import Link from 'next/link';

export default function ProfileDetailsTab() {
  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Профиль</h1>
        <Link href="/profile" className="text-sm underline">
          К обзору
        </Link>
      </div>

      <div className="app-panel p-4">
        <p className="app-muted">
          Расширенные поля паспорта, публичность и тренды будут здесь.
        </p>
      </div>
    </main>
  );
}
