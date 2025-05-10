// src/store/useUserStore.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface DiscordUser {
  id:       string
  username: string
  avatar:   string
}

interface UserState {
  user: DiscordUser | null
  setUser: (u: DiscordUser) => void
  clearUser: () => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (u) => set({ user: u }),
      clearUser: () => set({ user: null }),
    }),
    {
      name: 'discord-user', // ключ в localStorage
      // используем createJSONStorage, чтобы zustand корректно работал в SSR/ESM-окружениях
      storage: createJSONStorage(() => localStorage),
    }
  )
)
