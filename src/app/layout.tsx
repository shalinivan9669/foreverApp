import './globals.css';
import type { ReactNode } from 'react';
import { Cormorant_Infant, Hachi_Maru_Pop } from 'next/font/google';

const cormorantInfant = Cormorant_Infant({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display-face',
});

const hachiMaruPop = Hachi_Maru_Pop({
  subsets: ['latin', 'cyrillic'],
  weight: '400',
  display: 'swap',
  variable: '--font-accent-face',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${cormorantInfant.variable} ${hachiMaruPop.variable} min-h-dvh font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
