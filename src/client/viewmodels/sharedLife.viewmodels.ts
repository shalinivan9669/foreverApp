import type { SharedLifeEntryInput } from "@/lib/contracts/sharedLife";
import type { SharedLifeDTO, SharedLifeEntryDTO } from "@/lib/dto/sharedLife.dto";

export const SHARED_LIFE_SECTIONS = {
  TASK: { title: "Дела", description: "Что нужно сделать, кто берёт это на себя и сколько времени планирует.", action: "Добавить дело", empty: "Все договорённости о делах будут здесь." },
  SHOPPING: { title: "Покупки и желания", description: "Общий список: количество, кто покупает и что уже готово.", action: "Добавить покупку", empty: "Добавьте нужную покупку или желание, чтобы договориться о нём вместе." },
  EVENT: { title: "Повестка", description: "Ближайшие даты, встречи и повторяющиеся события.", action: "Добавить событие", empty: "Своих событий пока нет. Добавьте встречу или важную дату." },
  BUDGET: { title: "Реальный бюджет", description: "Ручной учёт доходов, расходов и взносов. Суммы в разных валютах считаются отдельно.", action: "Добавить операцию", empty: "Добавьте первую операцию: расход, доход или взнос." },
  GOAL: { title: "Цели и этапы", description: "Большие планы с небольшими шагами и отдельными отметками готовности.", action: "Добавить цель", empty: "Выберите общую цель и разбейте её на посильные этапы." },
  MEMORY: { title: "Хронология", description: "Ваши воспоминания по датам — от самых недавних к более ранним.", action: "Добавить воспоминание", empty: "Сохраните первый момент, к которому хочется вернуться." },
} satisfies Record<SharedLifeEntryInput["kind"], { title: string; description: string; action: string; empty: string }>;

export const sharedLifeRole = (role: string, myRole: "A" | "B") =>
  role === "NONE" ? "пока никто" : role === "BOTH" ? "вместе" : role === myRole ? "я" : "партнёр";

export const sharedLifeMoney = (minor: number, currency: string) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(minor / 100);

export const sharedLifeDate = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** Every editable field is included so the user can compare a server version with the form. */
export function sharedLifeEntryFields(item: SharedLifeEntryInput, myRole: "A" | "B") {
  const fields: Array<{ label: string; value: string }> = [{ label: "Название", value: item.title }];
  if ("date" in item) fields.push({ label: "Дата", value: item.date ? sharedLifeDate(item.date) : "Без даты" });
  if ("repeat" in item) {
    fields.push({ label: "Повторение", value: { NONE: "Не повторяется", WEEKLY: "Каждую неделю", MONTHLY: "Каждый месяц", YEARLY: "Каждый год" }[item.repeat] });
    if (item.lastCompletedDate) fields.push({ label: "Последнее выполненное повторение", value: sharedLifeDate(item.lastCompletedDate) });
  }
  if ("assignee" in item) fields.push({ label: item.kind === "BUDGET" ? "Чей вклад / расход" : "Ответственный", value: sharedLifeRole(item.assignee, myRole) });
  if (item.kind === "TASK") fields.push({ label: "Планируемое время", value: `${item.effortMinutes} мин` });
  if (item.kind === "SHOPPING") fields.push({ label: "Количество / вариант", value: item.quantity }, { label: "Кто покупает", value: sharedLifeRole(item.reservedBy, myRole) });
  if (item.kind === "BUDGET") fields.push({ label: "Операция", value: { INCOME: "Доход", EXPENSE: "Расход", CONTRIBUTION: "Взнос" }[item.direction] }, { label: "Сумма", value: sharedLifeMoney(item.amountMinor, item.currency) });
  if (item.kind === "GOAL") fields.push({ label: "Этапы", value: item.milestones.map((step) => `${step.done ? "Готово" : "В планах"}: ${step.title}`).join("\n") });
  if ("place" in item) fields.push({ label: "Место", value: item.place || "Не указано" });
  if (item.kind === "MEMORY") fields.push({ label: "Ссылка на фото", value: item.photoLink || "Не указана" });
  if ("status" in item) fields.push({ label: "Состояние", value: item.status === "DONE" ? "Завершено" : "В планах" });
  fields.push({ label: "Общая заметка", value: item.note || "Без заметки" });
  return fields;
}

export function sharedLifeEntries(entries: SharedLifeEntryDTO[], kind: SharedLifeEntryInput["kind"]) {
  return entries.filter((entry) => entry.data.kind === kind).sort((left, right) => {
    if (kind === "MEMORY" || kind === "BUDGET") return (right.nextDate ?? "").localeCompare(left.nextDate ?? "") || right.updatedAt.localeCompare(left.updatedAt);
    const done = (entry: SharedLifeEntryDTO) => Number("status" in entry.data && entry.data.status === "DONE");
    return done(left) - done(right) || (left.nextDate ?? "9999").localeCompare(right.nextDate ?? "9999");
  });
}

export function sharedLifeAgenda(data: SharedLifeDTO) {
  return [...data.occasions, ...data.entries.filter((entry) => entry.nextDate && (entry.data.kind === "EVENT" || entry.data.kind === "TASK") && entry.data.status !== "DONE")
    .map((entry) => ({ id: entry.id, title: entry.data.title, date: entry.nextDate!, source: "OWN" }))]
    .filter((item) => item.date >= data.today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
}
