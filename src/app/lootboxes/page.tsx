'use client';

import BackBar from '@/components/ui/BackBar';

export default function LootboxesPage() {
  return (
    <main className="mx-auto max-w-2xl p-4">
      <BackBar title="Lootboxes" fallbackHref="/main-menu" />
      <h1 className="mt-4 text-2xl font-semibold">Lootboxes</h1>
      <p className="mt-2 text-sm text-gray-600">This section is coming soon.</p>
    </main>
  );
}
