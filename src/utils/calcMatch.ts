// src/utils/calcMatch.ts
export function distance(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < 6; i++) {
    const da = (a[i] ?? 0) - (b[i] ?? 0);
    s += da * da;
  }
  return Math.sqrt(s);
}

export function score(d: number) {
  const maxD = Math.sqrt(6);                  // нормировка для 6 осей
  const raw  = 100 - (d / maxD) * 100;        // 0..100
  if (!Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, raw));     // защита от выхода за границы
}
