// src/components/activities/UserActivitiesPlaceholder.tsx
'use client';

export default function UserActivitiesPlaceholder() {
  return (
    <div className="border rounded p-4">
      <p className="text-sm text-gray-700">Личные активности в разработке.</p>
      <div className="mt-3 grid gap-2">
        <div className="h-14 bg-gray-100 rounded" />
        <div className="h-14 bg-gray-100 rounded" />
        <div className="h-14 bg-gray-100 rounded" />
      </div>
      <button className="px-3 py-2 rounded border mt-3" disabled>Предложить ещё</button>
    </div>
  );
}
