import type { UserType } from '@/models/User';
import type { PairType } from '@/models/Pair';

const AXES = ['communication','domestic','personalViews','finance','sexuality','psyche'] as const;
type Axis = typeof AXES[number];

const HIGH = 2.0;
const LOW = 0.75;
const DELTA = 2.0;

function inter(a: string[], b: string[]) { return a.filter(x => b.includes(x)); }

export function buildPassport(a: UserType, b: UserType): NonNullable<PairType['passport']> {
  const strongSides: { axis:string; facets:string[] }[] = [];
  const riskZones: { axis:string; facets:string[]; severity:1|2|3 }[] = [];
  const complementMap: { axis:string; A_covers_B:string[]; B_covers_A:string[] }[] = [];
  const levelDelta: { axis:string; delta:number }[] = [];

  for (const axis of AXES) {
    const A = a.vectors[axis];
    const B = b.vectors[axis];

    const bothHigh = A.level >= HIGH && B.level >= HIGH;
    const bothLow  = A.level <= LOW  && B.level <= LOW;
    const delta    = Math.abs(A.level - B.level);

    const pp = inter(A.positives, B.positives);
    const nn = inter(A.negatives, B.negatives);
    const AcoversB = inter(A.positives, B.negatives);
    const BcoversA = inter(B.positives, A.negatives);

    if (pp.length || bothHigh) {
      strongSides.push({ axis, facets: pp });
    }

    if (nn.length || bothLow || delta > DELTA) {
      const facets = nn.length ? nn : [];
      const severity: 1|2|3 =
        delta > DELTA + 1.0 ? 3 : (bothLow || nn.length >= 2 ? 2 : 1);
      riskZones.push({ axis, facets, severity });
    }

    if (AcoversB.length || BcoversA.length) {
      complementMap.push({ axis, A_covers_B: AcoversB, B_covers_A: BcoversA });
    }

    if (delta > 0.01) levelDelta.push({ axis, delta });
  }

  return { strongSides, riskZones, complementMap, levelDelta };
}
