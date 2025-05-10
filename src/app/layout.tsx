// src/app/layout.tsx
'use client';

import './globals.css';
import type { ReactNode } from 'react';
import { DiscordUserProvider } from '../context/DiscordUserContext';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">
        {/* ВАЖНО: весь <app> теперь внутри провайдера */}
        <DiscordUserProvider>
          {children}
        </DiscordUserProvider>
      </body>
    </html>
  );
}
