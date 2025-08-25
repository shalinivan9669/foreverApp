// src/app/profile/(tabs)/activities/page.tsx
'use client';
import Link from 'next/link';

export default function ProfileActivitiesTab() {
  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Личные активности</h1>
        <Link href="/profile" className="text-sm text-blue-600 hover:underline">к обзору</Link>
      </div>
      <div className="border rounded p-4">
        <p className="text-gray-700">Текущая | Предложено | История (будет позже; пока заглушка).</p>
      </div>
    </div>
  );
}
