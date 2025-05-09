'use client';
import type { ReactNode } from 'react';

export default function DiscordActivityLayout({ children }: { children: ReactNode }) {
  // Ничего лишнего: без next-auth, без хедера/футера
  return <>{children}</>;
}
