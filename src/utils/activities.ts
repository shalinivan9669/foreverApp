import { Types } from 'mongoose';
import { User } from '@/models/User';
import { Pair } from '@/models/Pair'; // нужен value-импорт, т.к. используем typeof Pair ниже
import { VectorSnapshot, type VectorSnapshotType } from '@/models/VectorSnapshot';
import type { CheckInTpl, EffectTpl, Axis } from '@/models/ActivityTemplate'; 
import {
  DEFAULT_SCORING_CONFIG,
  createVectorSnapshot,
  readAxisLayer,
  recalculateDisplayedVector,
} from '@/domain/services/vectorScoring.service';

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

  const updatedAt = new Date();
  const vectorSnapshots: VectorSnapshotType[] = [];

  for (const eff of effect) {
    const delta = eff.baseDelta * (0.5 + 0.5 * success) * difficultyK * fatigueK;

    const bump = (u: (typeof users)[number]) => {
      const axis = eff.axis as Axis;
      const v = u.vectors[axis];
      const before = readAxisLayer(u, axis, 'trait');
      const nextLevel = clamp(v.level * 0.9 + delta * 0.1);
      v.level = nextLevel;
      if (success >= 0.6 && eff.facetsAdd?.length) {
        v.positives = Array.from(new Set([...(v.positives ?? []), ...eff.facetsAdd]));
      }
      if (success < 0.35 && eff.facetsRemove?.length) {
        v.negatives = Array.from(new Set([...(v.negatives ?? []), ...eff.facetsRemove]));
      }
      const after = {
        ...before,
        level: nextLevel,
        positives: v.positives ?? [],
        negatives: v.negatives ?? [],
        scoringVersion: DEFAULT_SCORING_CONFIG.key,
        updatedAt,
      };
      v.trait = after;
      v.displayed = {
        ...recalculateDisplayedVector(after),
        updatedAt,
      };
      vectorSnapshots.push(
        createVectorSnapshot({
          userId: u.id,
          pairId: String(pairDoc._id),
          layer: 'trait',
          axis,
          before,
          after,
          reason: {
            source: 'manual_recalculation',
          },
          scoringVersion: DEFAULT_SCORING_CONFIG.key,
          createdAt: updatedAt,
        })
      );
    };

    const tgt: 'A' | 'B' | 'both' = eff.target ?? 'both';
    if (tgt === 'A') bump(users[0]);
    else if (tgt === 'B') bump(users[1]);
    else { bump(users[0]); bump(users[1]); }
  }

  await Promise.all(users.map(u => u.save()));
  if (vectorSnapshots.length > 0) {
    await VectorSnapshot.insertMany(vectorSnapshots);
  }

  // усталость/готовность пары
  pairDoc.fatigue = { score: clamp((pairDoc.fatigue?.score ?? 0) + (fatigueDelta ?? 0)), updatedAt };
  pairDoc.readiness = { score: clamp((pairDoc.readiness?.score ?? 0) + (readinessDelta ?? 0)), updatedAt };
  await pairDoc.save();
}
