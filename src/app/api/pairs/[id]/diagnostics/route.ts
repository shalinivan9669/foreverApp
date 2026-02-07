// DTO rule: return only DTO/view model (never raw DB model shape).
// GET /api/pairs/[id]/diagnostics
import { NextRequest } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Pair } from '@/models/Pair';
import { User, type UserType } from '@/models/User';
import { requireSession } from '@/lib/auth/guards';
import { requirePairMember } from '@/lib/auth/resourceGuards';
import { z } from 'zod';
import { jsonError, jsonOk } from '@/lib/api/response';
import { parseParams, parseQuery } from '@/lib/api/validate';

type Axis = 'communication' | 'domestic' | 'personalViews' | 'finance' | 'sexuality' | 'psyche';
const AXES: readonly Axis[] = ['communication','domestic','personalViews','finance','sexuality','psyche'] as const;
const HIGH = 2.0, LOW = 0.75, DELTA = 2.0;
const inter = (a: string[] = [], b: string[] = []) => a.filter(x => b.includes(x));

function buildPassport(a: UserType, b: UserType) {
  const strongSides:   { axis: Axis; facets: string[] }[] = [];
  const riskZones:     { axis: Axis; facets: string[]; severity: 1|2|3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta:    { axis: Axis; delta: number }[] = [];

  for (const axis of AXES) {
    const A = a.vectors[axis]; const B = b.vectors[axis];
    const bothHigh = A.level >= HIGH && B.level >= HIGH;
    const bothLow  = A.level <= LOW  && B.level <= LOW;
    const delta    = Math.abs(A.level - B.level);

    const pp = inter(A.positives, B.positives);
    const nn = inter(A.negatives, B.negatives);
    const AcoversB = inter(A.positives, B.negatives);
    const BcoversA = inter(B.positives, A.negatives);

    if (pp.length || bothHigh) strongSides.push({ axis, facets: pp });
    if (nn.length || bothLow || delta > DELTA) {
      const severity: 1|2|3 = delta > DELTA + 1 ? 3 : (bothLow || nn.length >= 2 ? 2 : 1);
      riskZones.push({ axis, facets: nn.length ? nn : [], severity });
    }
    if (AcoversB.length || BcoversA.length) complementMap.push({ axis, A_covers_B: AcoversB, B_covers_A: BcoversA });
    if (delta > 0.01) levelDelta.push({ axis, delta });
  }
  return { strongSides, riskZones, complementMap, levelDelta };
}

interface Ctx { params: Promise<{ id: string }> }

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const query = parseQuery(req, z.object({}).passthrough());
  if (!query.ok) return query.response;

  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const params = parseParams(await ctx.params, paramsSchema);
  if (!params.ok) return params.response;
  const { id } = params.data;

  const pairGuard = await requirePairMember(id, currentUserId);
  if (!pairGuard.ok) return pairGuard.response;

  await connectToDatabase();
  const pair = pairGuard.data.pair;
  const [ua, ub] = await Promise.all([
    User.findOne({ id: pair.members[0] }).lean<UserType | null>(),
    User.findOne({ id: pair.members[1] }).lean<UserType | null>(),
  ]);
  if (!ua || !ub) return jsonError(404, 'USER_NOT_FOUND', 'users missing');

  const passport = buildPassport(ua, ub);
  const lastDiagnosticsAt = new Date();

  await Pair.updateOne(
    { _id: pair._id },
    { $set: { 'passport.strongSides': passport.strongSides, 'passport.riskZones': passport.riskZones, 'passport.complementMap': passport.complementMap, 'passport.levelDelta': passport.levelDelta, 'passport.lastDiagnosticsAt': lastDiagnosticsAt } }
  );

  return jsonOk({ pairId: id, passport: { ...passport, lastDiagnosticsAt } });
}


