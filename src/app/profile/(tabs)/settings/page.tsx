// src/app/profile/(tabs)/settings/page.tsx
'use client';

import Link from 'next/link';

export default function ProfileSettingsTab() {
  return (
    <main className="app-shell-compact space-y-4 py-3 sm:py-4 lg:py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Настройки</h1>
        <Link href="/profile" className="text-sm underline">
          К обзору
        </Link>
      </div>

      <div className="app-panel app-panel-solid space-y-3 p-4">
        <p className="app-muted">Уведомления, приватность, аккаунт, данные — позже.</p>
      </div>
    </main>
  );
}
