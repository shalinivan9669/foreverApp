// src/context/DiscordUserContext.tsx
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export interface DiscordUser {
  id: string;
  username: string;
  avatar: string;
}

interface ContextValue {
  user: DiscordUser | null;
  setUser: (u: DiscordUser) => void;
}

const DiscordUserContext = createContext<ContextValue>({
  user: null,
  setUser: () => {},  // заглушка на случай, если провайдера нет
});

export function DiscordUserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<DiscordUser | null>(null);
  return (
    <DiscordUserContext.Provider value={{ user, setUser }}>
      {children}
    </DiscordUserContext.Provider>
  );
}

export function useDiscordUser() {
  return useContext(DiscordUserContext);
}
