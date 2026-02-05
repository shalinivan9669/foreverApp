import type { UserType } from '@/models/User';

export type Axis =
  | 'communication'
  | 'domestic'
  | 'personalViews'
  | 'finance'
  | 'sexuality'
  | 'psyche';

export type VectorAnswer = { qid: string; ui: number };

export type VectorQuestion = {
  axis: Axis;
  facet: string;
  map: number[];
};

const AXES: Axis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const toNumeric = (q: VectorQuestion, ui: number) => {
  const idx = Math.max(0, Math.min((ui ?? 1) - 1, q.map.length - 1));
  return q.map[idx]; // -3..+3
};

export function buildVectorUpdate(
  current: Pick<UserType, 'vectors'>,
  answers: VectorAnswer[],
  qMap: Record<string, VectorQuestion>
) {
  const addSigned: Record<Axis, number> = {
    communication: 0,
    domestic: 0,
    personalViews: 0,
    finance: 0,
    sexuality: 0,
    psyche: 0,
  };
  const cnt: Record<Axis, number> = { ...addSigned };

  const pos: Record<Axis, string[]> = {
    communication: [],
    domestic: [],
    personalViews: [],
    finance: [],
    sexuality: [],
    psyche: [],
  };
  const neg: Record<Axis, string[]> = JSON.parse(JSON.stringify(pos));

  for (const { qid, ui } of answers) {
    const q = qMap[qid];
    if (!q || typeof ui !== 'number') continue;

    const num = toNumeric(q, ui); // -3..+3
    const axis = q.axis;

    addSigned[axis] += num / 3; // -1..1
    cnt[axis] += 1;

    if (num >= 2) pos[axis].push(q.facet);
    if (num <= -2) neg[axis].push(q.facet);
  }

  const setLevels: Record<string, number> = {};
  for (const axis of AXES) {
    if (!cnt[axis]) continue;
    const prev = Number(current.vectors?.[axis]?.level ?? 0);
    const avgSigned = addSigned[axis] / cnt[axis];
    const next = clamp01(prev + avgSigned * 0.25);
    setLevels[`vectors.${axis}.level`] = next;
  }

  const addToSet: Record<string, { $each: string[] }> = {};
  for (const axis of AXES) {
    if (pos[axis].length) addToSet[`vectors.${axis}.positives`] = { $each: pos[axis] };
    if (neg[axis].length) addToSet[`vectors.${axis}.negatives`] = { $each: neg[axis] };
  }

  return { setLevels, addToSet };
}
