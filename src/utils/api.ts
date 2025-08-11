// src/utils/api.ts
export function api(path: string) {
  return (typeof window !== 'undefined' ? '/.proxy' : '') + path;
}
