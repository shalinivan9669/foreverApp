// src/components/activities/UserActivitiesPlaceholder.tsx
'use client';

export default function UserActivitiesPlaceholder() {
  return (
    <div className="app-panel app-panel-solid p-4">
      <p className="text-sm">Личные активности в разработке.</p>
      <div className="mt-3 grid gap-2">
        <div className="app-panel-soft app-panel-soft-solid h-14 rounded" />
        <div className="app-panel-soft app-panel-soft-solid h-14 rounded" />
        <div className="app-panel-soft app-panel-soft-solid h-14 rounded" />
      </div>
      <button type="button" className="app-btn-secondary mt-3 px-3 py-2 text-sm" disabled>
        Предложить ещё
      </button>
    </div>
  );
}
