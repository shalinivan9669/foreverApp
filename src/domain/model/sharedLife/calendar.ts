import type {
  SharedLifeEntryInput,
  SharedLifeSettings,
} from "@/lib/contracts/sharedLife";

const pad = (value: number) => String(value).padStart(2, "0");
const dateString = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;
const clampDate = (year: number, month: number, day: number) =>
  dateString(
    year,
    month,
    Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate()),
  );

/** Local calendar arithmetic; no timezone conversion and original day remains the anchor. */
export function nextCalendarOccurrence(
  anchor: string,
  repeat: "NONE" | "WEEKLY" | "MONTHLY" | "YEARLY",
  today: string,
): string | null {
  if (anchor >= today) return anchor;
  if (repeat === "NONE") return null;
  const [, month, day] = anchor.split("-").map(Number);
  const [currentYear, currentMonth] = today.split("-").map(Number);
  if (repeat === "WEEKLY") {
    const start = Date.parse(`${anchor}T12:00:00Z`);
    const target = Date.parse(`${today}T12:00:00Z`);
    return new Date(
      start + Math.ceil((target - start) / 604_800_000) * 604_800_000,
    )
      .toISOString()
      .slice(0, 10);
  }
  if (repeat === "YEARLY") {
    const candidate = clampDate(currentYear, month, day);
    return candidate >= today
      ? candidate
      : clampDate(currentYear + 1, month, day);
  }
  const candidate = clampDate(currentYear, currentMonth, day);
  if (candidate >= today) return candidate;
  return clampDate(
    currentMonth === 12 ? currentYear + 1 : currentYear,
    currentMonth === 12 ? 1 : currentMonth + 1,
    day,
  );
}

export function nextEntryDate(
  data: SharedLifeEntryInput,
  today: string,
): string | null {
  if (!("date" in data) || !data.date) return null;
  if (
    (data.kind === "EVENT" || data.kind === "TASK") &&
    data.repeat !== "NONE"
  ) {
    const afterCompletion = data.lastCompletedDate
      ? new Date(Date.parse(`${data.lastCompletedDate}T12:00:00Z`) + 86400000)
          .toISOString()
          .slice(0, 10)
      : today;
    return nextCalendarOccurrence(
      data.date,
      data.repeat,
      afterCompletion > today ? afterCompletion : today,
    );
  }
  return data.date;
}

export function systemOccasions(settings: SharedLifeSettings, today: string) {
  const items: Array<{
    id: string;
    title: string;
    date: string;
    source: "CALENDAR" | "AUTHOR" | "ANNIVERSARY";
    optional: true;
  }> = [];
  if (settings.relationshipStartDate)
    items.push({
      id: "anniversary",
      title: "Ваша годовщина",
      date: nextCalendarOccurrence(
        settings.relationshipStartDate,
        "YEARLY",
        today,
      )!,
      source: "ANNIVERSARY",
      optional: true,
    });
  if (settings.holidaysEnabled) {
    for (const [id, title, date] of [
      ["new-year", "Новый год", "2000-01-01"],
      ["kindness", "День добрых дел: придумайте свой повод", "2000-11-13"],
    ])
      items.push({
        id,
        title,
        date: nextCalendarOccurrence(date, "YEARLY", today)!,
        source: "CALENDAR",
        optional: true,
      });
  }
  if (settings.authorEventsEnabled)
    items.push({
      id: "author-time-together",
      title: "Предложение авторов: час друг для друга",
      date: nextCalendarOccurrence("2000-01-02", "MONTHLY", today)!,
      source: "AUTHOR",
      optional: true,
    });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeBudget(entries: readonly SharedLifeEntryInput[]) {
  const totals = new Map<
    string,
    {
      currency: string;
      incomeMinor: number;
      expenseMinor: number;
      contributionMinor: number;
      balanceMinor: number;
    }
  >();
  for (const entry of entries)
    if (entry.kind === "BUDGET") {
      const row = totals.get(entry.currency) ?? {
        currency: entry.currency,
        incomeMinor: 0,
        expenseMinor: 0,
        contributionMinor: 0,
        balanceMinor: 0,
      };
      if (entry.direction === "EXPENSE") row.expenseMinor += entry.amountMinor;
      else if (entry.direction === "CONTRIBUTION")
        row.contributionMinor += entry.amountMinor;
      else row.incomeMinor += entry.amountMinor;
      row.balanceMinor =
        row.incomeMinor + row.contributionMinor - row.expenseMinor;
      totals.set(entry.currency, row);
    }
  return [...totals.values()];
}
