// src/store/useUserStore.ts
import { create } from 'zustand'

export interface DiscordUser {
  id: string
  username: string
  avatar: string
}

interface UserState {
  user: DiscordUser | null
  setUser: (u: DiscordUser) => void
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
}))
