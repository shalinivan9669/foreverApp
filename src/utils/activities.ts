import { Types } from 'mongoose';
import { User } from '@/models/User';
import { Pair } from '@/models/Pair'; // нужен value-импорт, т.к. используем typeof Pair ниже
import type { CheckInTpl, EffectTpl, Axis } from '@/models/ActivityTemplate'; 

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function normalizeUI(ci: CheckInTpl, ui: number): number {
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, ci.map.length - 1));
  const num = ci.map[idx];              // -3..3
  return Math.abs(num) / 3;             // 0..1
}

export function successScore(
  checkIns: CheckInTpl[],
  answers: Array<{ checkInId: string; by: 'A' | 'B'; ui: number }>
): number {
  if (!checkIns.length) return 1;

  const grouped = new Map<string, number[]>();

  for (const a of answers) {
    const ci = checkIns.find(c => c.id === a.checkInId);
    if (!ci) continue;
    const v = normalizeUI(ci, a.ui);
    grouped.set(ci.id, [...(grouped.get(ci.id) ?? []), v]);
  }

  let num = 0, den = 0;

  for (const ci of checkIns) {
    const vals = grouped.get(ci.id) ?? [];
    if (!vals.length) continue;
    const v = vals.reduce((s, x) => s + x, 0) / vals.length;
    const w = ci.weight ?? 1;
    num += v * w;
    den += w;
  }

  return den ? clamp(num / den) : 0;
}

// допускаем целевой участник в эффекте (опционально)
type Eff = EffectTpl & { target?: 'A' | 'B' | 'both' };

export async function applyEffects(params: {
  pairDoc: InstanceType<typeof Pair>;
  members: [Types.ObjectId, Types.ObjectId];
  effect: Eff[];
  success: number;              // 0..1
  fatigueDelta?: number;
  readinessDelta?: number;
}) {
  const { pairDoc, members, effect, success, fatigueDelta = 0, readinessDelta = 0 } = params;

  const users = await User.find({ _id: { $in: members } });
  const difficultyK = 1;                                   // место для усложнения
  const fatigueK = 1 - Math.pow(pairDoc.fatigue?.score ?? 0, 2); // сильная усталость режет прирост

  for (const eff of effect) {
    const delta = eff.baseDelta * (0.5 + 0.5 * success) * difficultyK * fatigueK;

    const bump = (u: (typeof users)[number]) => {
      const v = u.vectors[eff.axis as Axis];
      v.level = v.level * 0.9 + delta * 0.1;               // EMA
      if (success >= 0.6 && eff.facetsAdd?.length) {
        v.positives = Array.from(new Set([...(v.positives ?? []), ...eff.facetsAdd]));
      }
      if (success < 0.35 && eff.facetsRemove?.length) {
        v.negatives = Array.from(new Set([...(v.negatives ?? []), ...eff.facetsRemove]));
      }
    };

    const tgt: 'A' | 'B' | 'both' = eff.target ?? 'both';
    if (tgt === 'A') bump(users[0]);
    else if (tgt === 'B') bump(users[1]);
    else { bump(users[0]); bump(users[1]); }
  }

  await Promise.all(users.map(u => u.save()));

  // усталость/готовность пары
  pairDoc.fatigue = { score: clamp((pairDoc.fatigue?.score ?? 0) + (fatigueDelta ?? 0)), updatedAt: new Date() };
  pairDoc.readiness = { score: clamp((pairDoc.readiness?.score ?? 0) + (readinessDelta ?? 0)), updatedAt: new Date() };
  await pairDoc.save();
}
