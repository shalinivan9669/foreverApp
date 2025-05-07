'use client';
import './globals.css';  
import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">
      <SessionProvider>
        {children} 
      </SessionProvider>
      </body>
    </html>
  );
}
