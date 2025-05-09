// src/app/layout.tsx
'use client';

import './globals.css';
import type { ReactNode } from 'react';
import { DiscordUserProvider } from '../context/DiscordUserContext';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">
        {/* Оборачиваем всё в наш контекст */}
        <DiscordUserProvider>
          {children}
        </DiscordUserProvider>
      </body>
    </html>
  );
}
