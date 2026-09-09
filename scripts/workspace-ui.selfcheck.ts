import assert from "node:assert/strict";
import { developmentLibraryHref, developmentRunStatus, filterDevelopmentCatalog, recentCompletedDevelopmentRuns, resumableDevelopmentRuns } from "@/client/viewmodels/development.viewmodels";
import { sharedLifeAgenda, sharedLifeEntries, sharedLifeEntryFields } from "@/client/viewmodels/sharedLife.viewmodels";
import type { DevelopmentCardDTO, DevelopmentOverviewDTO, DevelopmentRunDTO } from "@/lib/dto/development.dto";
import type { SharedLifeDTO, SharedLifeEntryDTO } from "@/lib/dto/sharedLife.dto";
import { DEFAULT_SHARED_LIFE_SETTINGS, type SharedLifeEntryInput } from "@/lib/contracts/sharedLife";

const card = (key: string, kind: DevelopmentCardDTO["kind"], domain: DevelopmentCardDTO["domain"]): DevelopmentCardDTO => ({ key, kind, domain, title: "Занятие", revision: 1, purpose: "Наблюдение", durationMinutes: 5, conditions: "Добровольно", outcome: "Опыт", reviewStatus: "DEMO_SELF_REFLECTION", locked: false, completedCount: 0 });
const runs: DevelopmentRunDTO[] = Array.from({ length: 35 }, (_, index) => ({ id: `run-${index}`, contentKey: "personal", periodKey: "2026-09-07", pairId: null, status: "ACTIVE", myCompletion: false, partnerCompleted: false, completedAt: null }));
const overview: DevelopmentOverviewDTO = { content: [card("personal", "SOLO_PRACTICE", "communication"), card("reflection", "REFLECTION", "finance"), card("together", "TOPIC", "communication")], domains: [], programs: [], recent: runs, suggestion: { contentKey: "personal", title: "Занятие", reason: "Начать", basedOn: "EXPLORATION" } };
assert.deepEqual(filterDevelopmentCatalog(overview, { audience: "personal", domain: "all", kind: "all" }).map((item) => item.key), ["personal", "reflection"]);
assert.deepEqual(filterDevelopmentCatalog(overview, { audience: "together", domain: "communication", kind: "TOPIC" }).map((item) => item.key), ["together"]);
assert.equal(filterDevelopmentCatalog(overview, { audience: "personal", domain: "communication", kind: "REFLECTION" }).length, 0);
assert.equal(resumableDevelopmentRuns(overview, "pair", "active").length, 35, "the library audience filter must not limit the complete continuation list");
const completedRun = (id: string, completedAt: string, pairId: string | null = null): DevelopmentRunDTO => ({ ...runs[0], id, pairId, status: "COMPLETED", myCompletion: true, partnerCompleted: Boolean(pairId), completedAt });
const completedOverview: DevelopmentOverviewDTO = { ...overview, recent: [
  completedRun("personal-old", "2026-09-07T10:00:00Z"),
  completedRun("current-pair", "2026-09-08T10:00:00Z", "pair"),
  completedRun("former-pair", "2026-09-09T10:00:00Z", "former"),
  completedRun("personal-new", "2026-09-09T09:00:00Z"),
  { ...completedRun("not-my-result", "2026-09-09T12:00:00Z"), myCompletion: false },
  { ...completedRun("partial", "2026-09-09T12:00:00Z", "pair"), status: "PARTIAL" },
] };
const completedIds = (pairId: string | null, status?: "active" | "paused" | "ended") => recentCompletedDevelopmentRuns(completedOverview, pairId, status).map((run) => run.id);
assert.deepEqual(completedIds("pair", "active"), ["personal-new", "current-pair", "personal-old"]);
assert.deepEqual(completedIds("pair", "paused"), ["personal-new", "current-pair", "personal-old"], "paused current pair results remain readable");
for (const status of [undefined, "ended"] as const) assert.deepEqual(completedIds("pair", status), ["personal-new", "personal-old"], "unconfirmed or ended pair context must not expose cached pair results");
assert.deepEqual(completedIds(null, "active"), ["personal-new", "personal-old"], "loss of pair access removes cached pair results");
assert.equal(completedOverview.recent[0].id, "personal-old", "recent-result ordering must not mutate the overview");
assert.equal(recentCompletedDevelopmentRuns({ ...overview, recent: Array.from({ length: 35 }, (_, index) => completedRun(`complete-${index}`, `2026-09-09T10:00:${String(index).padStart(2, "0")}Z`)) }).length, 30, "recent results are bounded and must not imply a complete archive");
assert.match(developmentRunStatus(completedOverview.recent[1], true), /доступен для просмотра/, "a completed paused result must offer reading rather than resuming");
const query = "scope=together&format=TOPIC&area=communication&program=two%2Fsteps";
const opened = developmentLibraryHref(query, { run: "old/run?x=1" });
const params = new URL(opened, "https://example.test").searchParams;
assert.equal(params.get("run"), "old/run?x=1");
assert.equal(params.get("program"), "two/steps");
assert.equal(developmentLibraryHref(params.toString(), { run: null }), `/development?${query}`, "closing an immutable run restores every catalogue and program filter");
assert.equal(developmentLibraryHref("run=only", { run: null }), "/development");
assert.equal(new URL(developmentLibraryHref(query, { scope: "personal", format: null }), "https://example.test").searchParams.has("format"), false);

const entry = (id: string, data: SharedLifeEntryInput): SharedLifeEntryDTO => ({ id, data, nextDate: "date" in data ? data.date ?? null : null, createdBy: "A", updatedBy: "B", updatedAt: "2026-09-07T12:00:00Z" });
const task = (status: "OPEN" | "DONE", date: string): SharedLifeEntryInput => ({ kind: "TASK", title: "Дело", note: "Заметка", date, status, repeat: "NONE", assignee: "B", effortMinutes: 30 });
const entries = [entry("done", task("DONE", "2026-09-01")), entry("later", task("OPEN", "2026-09-09")), entry("today", task("OPEN", "2026-09-07")), entry("memory-old", { kind: "MEMORY", title: "Момент", note: "", date: "2026-08-01", place: "Город" }), entry("memory-new", { kind: "MEMORY", title: "Новый момент", note: "", date: "2026-09-07", place: "", photoLink: "https://example.test/photo" })];
assert.deepEqual(sharedLifeEntries(entries, "TASK").map((item) => item.id), ["today", "later", "done"]);
assert.deepEqual(sharedLifeEntries(entries, "MEMORY").map((item) => item.id), ["memory-new", "memory-old"]);
assert.equal(entries[0].id, "done", "presentation sorting must not mutate the server snapshot");
const workspace: SharedLifeDTO = { pairId: "pair", revision: 1, myRole: "A", readOnly: false, today: "2026-09-07", settings: DEFAULT_SHARED_LIFE_SETTINGS, entries, budget: [], taskLoad: [], changes: [], occasions: [] };
assert.deepEqual(sharedLifeAgenda(workspace).map((item) => item.id), ["today", "later"]);
const taskFields = sharedLifeEntryFields(task("OPEN", "2026-09-07"), "A");
assert.equal(taskFields.find((field) => field.label === "Ответственный")?.value, "партнёр");
assert.equal(taskFields.find((field) => field.label === "Планируемое время")?.value, "30 мин");
assert.equal(taskFields.find((field) => field.label === "Общая заметка")?.value, "Заметка");
const goalFields = sharedLifeEntryFields({ kind: "GOAL", title: "Цель", note: "", assignee: "BOTH", status: "OPEN", milestones: [{ title: "Первый", done: true }, { title: "Второй", done: false }] }, "A");
assert.equal(goalFields.find((field) => field.label === "Этапы")?.value, "Готово: Первый\nВ планах: Второй");
const moneyFields = sharedLifeEntryFields({ kind: "BUDGET", title: "Покупка", note: "", date: "2026-09-07", direction: "EXPENSE", amountMinor: 12345, currency: "KZT", assignee: "A" }, "A");
assert.match(moneyFields.find((field) => field.label === "Сумма")?.value ?? "", /123,45/);
const memoryFields = sharedLifeEntryFields(entries[4].data, "A");
assert.equal(memoryFields.find((field) => field.label === "Ссылка на фото")?.value, "https://example.test/photo");
console.log("Workspace UI self-check passed: personal/shared filters, all 35 continuations, bounded completed results and pair access, preserved deep links, agenda ordering and complete conflict comparison fields.");
