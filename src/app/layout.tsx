// src/app/layout.tsx
import './globals.css';
import { DiscordUserProvider } from '../context/DiscordUserContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <DiscordUserProvider>
          {children}
        </DiscordUserProvider>
      </body>
    </html>
  );
}
