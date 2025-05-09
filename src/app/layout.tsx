// src/app/layout.tsx
 'use client';
 import './globals.css';
 import type { ReactNode } from 'react';
 // Импорт провайдера из твоего контекста
 import { DiscordUserProvider } from '../context/DiscordUserContext';

 export default function RootLayout({ children }: { children: ReactNode }) {
   return (
     <html lang="ru">
       <body className="antialiased">
         {/* теперь весь твой tree видит useDiscordUser() */}
         <DiscordUserProvider>
           {children}
         </DiscordUserProvider>
       </body>
     </html>
   );
 }
