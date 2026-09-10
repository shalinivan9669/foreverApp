import type { TimedAssessmentPairReport } from './boundaries';
import { ordinalReportTrend } from './engine/pair';
import { betaIntervalSchema } from './schedule';

/** An occurrence uses instant intervals; category changes do not prove a causal skill effect. */
export function compareBetaOccurrenceReports(before: TimedAssessmentPairReport, after: TimedAssessmentPairReport): ReturnType<typeof ordinalReportTrend> {
  const first = betaIntervalSchema.safeParse({ startsAt: before.window.start, endsAt: before.window.end });
  const second = betaIntervalSchema.safeParse({ startsAt: after.window.start, endsAt: after.window.end });
  if (!first.success || !second.success || before.authorId !== after.authorId || before.context !== after.context
    || before.agreementRevision !== after.agreementRevision || before.period === after.period
    || before.window.definitionVersion !== 'beta-agreement-occurrence-v1' || after.window.definitionVersion !== before.window.definitionVersion
    || Date.parse(first.data.endsAt) > Date.parse(second.data.startsAt)
    || Date.parse(first.data.endsAt) - Date.parse(first.data.startsAt) !== Date.parse(second.data.endsAt) - Date.parse(second.data.startsAt)) return 'INCOMPARABLE';
  return ordinalReportTrend(before, after);
}
