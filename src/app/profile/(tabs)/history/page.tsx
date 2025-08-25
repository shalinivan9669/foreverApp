// src/app/profile/(tabs)/history/page.tsx
'use client';
import Link from 'next/link';

export default function ProfileHistoryTab() {
  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">История</h1>
        <Link href="/profile" className="text-sm text-blue-600 hover:underline">к обзору</Link>
      </div>
      <div className="border rounded p-4">
        <p className="text-gray-700">Пары, активности и логи (будет позже).</p>
      </div>
    </div>
  );
}
