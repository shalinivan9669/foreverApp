import { create } from 'zustand';
import type { UiErrorState } from '@/client/api/errors';

export type UiToastLevel = 'info' | 'success' | 'error';

export type UiToast = {
  id: string;
  level: UiToastLevel;
  message: string;
  createdAt: number;
};

type UiState = {
  loadingByKey: Record<string, boolean>;
  lastError: UiErrorState | null;
  toasts: UiToast[];
  setLoading: (key: string, value: boolean) => void;
  setLastError: (error: UiErrorState | null) => void;
  pushToast: (toast: Omit<UiToast, 'createdAt'>) => void;
  removeToast: (toastId: string) => void;
  clearToasts: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  loadingByKey: {},
  lastError: null,
  toasts: [],

  setLoading: (key, value) =>
    set((state) => ({
      loadingByKey: {
        ...state.loadingByKey,
        [key]: value,
      },
    })),

  setLastError: (error) =>
    set({
      lastError: error,
    }),

  pushToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          ...toast,
          createdAt: Date.now(),
        },
      ],
    })),

  removeToast: (toastId) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== toastId),
    })),

  clearToasts: () =>
    set({
      toasts: [],
    }),
}));
