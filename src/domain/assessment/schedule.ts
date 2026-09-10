import { z } from 'zod';

export const betaTimezoneSchema = z.string().min(1).max(80).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}, 'INVALID_IANA_TIMEZONE');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
export const betaIntervalSchema = z.object({ startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }) }).strict()
  .refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt), 'INTERVAL_MUST_HAVE_POSITIVE_DURATION');
export type BetaInterval = z.infer<typeof betaIntervalSchema>;
export const betaRecurrenceSchema = z.object({
  timezone: betaTimezoneSchema, startsOn: date, endsBefore: date,
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(values => new Set(values).size === values.length),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/), durationMinutes: z.number().int().min(1).max(1440),
  ambiguousTimePolicy: z.literal('REJECT'), nonexistentTimePolicy: z.literal('REJECT'),
}).strict().refine(value => {
  const days = (Date.parse(value.endsBefore) - Date.parse(value.startsOn)) / 86400000;
  return days >= 1 && days <= 56;
}, 'HORIZON_MUST_BE_1_TO_56_DAYS');
export type BetaRecurrence = z.infer<typeof betaRecurrenceSchema>;
function wallClock(instant: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(instant);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
/** Local ambiguous/nonexistent times are rejected; no silent DST shift. Explicit instants remain half-open. */
export function localTimeToInstant(day: string, time: string, timezone: string): string {
  const target = `${day}T${time}`, naive = Date.parse(`${target}:00.000Z`);
  if (!Number.isFinite(naive)) throw new Error('INVALID_LOCAL_TIME');
  const offsets = new Set([-86400000, 0, 86400000].map(delta => {
    const sample = naive + delta;
    return Date.parse(`${wallClock(sample, timezone)}:00.000Z`) - sample;
  }));
  const candidates = [...offsets].map(offset => naive - offset).filter(instant => wallClock(instant, timezone) === target);
  if (candidates.length !== 1) throw new Error(candidates.length ? 'AMBIGUOUS_LOCAL_TIME' : 'NONEXISTENT_LOCAL_TIME');
  return new Date(candidates[0]).toISOString();
}
export function expandBetaRecurrence(input: BetaRecurrence): Array<BetaInterval & { key: string }> {
  const schedule = betaRecurrenceSchema.parse(input), result: Array<BetaInterval & { key: string }> = [];
  for (let cursor = Date.parse(schedule.startsOn); cursor < Date.parse(schedule.endsBefore); cursor += 86400000) {
    const day = new Date(cursor);
    if (!schedule.weekdays.includes(day.getUTCDay())) continue;
    const localDate = day.toISOString().slice(0, 10), startsAt = localTimeToInstant(localDate, schedule.localTime, schedule.timezone);
    result.push({ key: `${localDate}:${schedule.localTime}`, startsAt, endsAt: new Date(Date.parse(startsAt) + schedule.durationMinutes * 60000).toISOString() });
  }
  if (!result.length) throw new Error('SCHEDULE_HAS_NO_OCCURRENCES');
  return result;
}
export function betaIntervalsOverlap(a: readonly BetaInterval[], b: readonly BetaInterval[]): boolean {
  return a.some(left => b.some(right => Math.max(Date.parse(left.startsAt), Date.parse(right.startsAt)) < Math.min(Date.parse(left.endsAt), Date.parse(right.endsAt))));
}
export function betaInQuietHours(now: Date, timezone: string, start: number, end: number): boolean {
  const hour = Number(wallClock(now.getTime(), timezone).slice(11, 13));
  return start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
