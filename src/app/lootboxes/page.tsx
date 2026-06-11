'use client';

import BackBar from '@/components/ui/BackBar';

export default function LootboxesPage() {
  return (
    <main className="app-shell-compact app-page-stack py-3 sm:py-5 lg:py-7">
      <BackBar title="Lootboxes" fallbackHref="/main-menu" />
      <div className="app-page-state">
        <section className="app-panel app-panel-solid p-4 sm:p-6">
          <h1 className="app-page-title font-semibold">Lootboxes</h1>
          <p className="app-muted mt-2 text-sm">This section is coming soon.</p>
        </section>
      </div>
    </main>
  );
}
