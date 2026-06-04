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
import { buildPairAnswerDiagnostics } from '@/domain/services/pairAnswerScoring.service';

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

  const diagnostics = await buildPairAnswerDiagnostics({
    pairId: id,
    left: ua,
    right: ub,
  });
  const passport = diagnostics.passport;
  const lastDiagnosticsAt = new Date();

  await Pair.updateOne(
    { _id: pair._id },
    {
      $set: {
        'passport.strongSides': passport.strongSides,
        'passport.riskZones': passport.riskZones,
        'passport.complementMap': passport.complementMap,
        'passport.levelDelta': passport.levelDelta,
        'passport.lastDiagnosticsAt': lastDiagnosticsAt,
        'passport.axes': diagnostics.axes,
        'passport.pairAnswerSignals': diagnostics.pairAnswerSignals,
        'passport.overall': diagnostics.overall,
        'passport.generatedInsightIds': diagnostics.generatedInsightIds,
      },
    }
  );

  return jsonOk({
    pairId: id,
    passport: { ...passport, lastDiagnosticsAt },
    axes: diagnostics.axes,
    pairAnswerSignals: diagnostics.pairAnswerSignals,
    overall: diagnostics.overall,
    fatigue: pair.fatigue,
    readiness: pair.readiness,
    generatedInsightIds: diagnostics.generatedInsightIds,
  });
}


