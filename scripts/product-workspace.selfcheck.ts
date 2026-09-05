import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEVELOPMENT_CATALOG,
  DEVELOPMENT_DOMAINS,
  DEVELOPMENT_PROGRAMS,
} from "@/domain/model/development/catalog";
import { createDevelopmentContentRepository } from "@/domain/model/development/publications";
import {
  DEVELOPMENT_CONTENT_V1,
  REFLECTION_OPTIONS_V1,
} from "@/domain/model/development/published/v1";
import {
  developmentPeriod,
  validateDevelopmentAnswers,
} from "@/domain/model/development/progress";
import {
  localDateSchema,
  sharedLifeEntrySchema,
  sharedLifeCommandSchema,
  DEFAULT_SHARED_LIFE_SETTINGS,
} from "@/lib/contracts/sharedLife";
import {
  nextCalendarOccurrence,
  nextEntryDate,
  summarizeBudget,
  systemOccasions,
} from "@/domain/model/sharedLife/calendar";
import { PairWorkspace } from "@/models/PairWorkspace";
import { toSharedLifeDTO } from "@/lib/dto/sharedLife.dto";
import { toDevelopmentRunDTO } from "@/lib/dto/development.dto";

assert.equal(DEVELOPMENT_DOMAINS.length, 6);
assert.equal(
  new Set(DEVELOPMENT_CATALOG.map((item) => item.key)).size,
  DEVELOPMENT_CATALOG.length,
);
for (const [kind, minimum] of [
  ["REFLECTION", 8],
  ["SOLO_PRACTICE", 18],
  ["PAIR_PRACTICE", 18],
  ["TOPIC", 30],
  ["LEISURE", 30],
] as const)
  assert.ok(
    DEVELOPMENT_CATALOG.filter((item) => item.kind === kind).length >= minimum,
  );
for (const item of DEVELOPMENT_CATALOG) {
  assert.equal(item.reviewStatus, "DEMO_SELF_REFLECTION");
  assert.ok(
    item.steps.length && item.purpose && item.conditions && item.outcome,
  );
  assert.ok(DEVELOPMENT_DOMAINS.some((domain) => domain.key === item.domain));
}
for (const program of DEVELOPMENT_PROGRAMS)
  for (const key of program.contentKeys)
    assert.ok(DEVELOPMENT_CATALOG.some((item) => item.key === key));
const reflection = DEVELOPMENT_CATALOG.find(
  (item) => item.kind === "REFLECTION",
)!;
assert.throws(() => validateDevelopmentAnswers(reflection, []));
assert.throws(() =>
  validateDevelopmentAnswers(reflection, [
    { question: 0, value: 1 },
    { question: 0, value: 1 },
    { question: 2, value: 1 },
  ]),
);
assert.equal(
  validateDevelopmentAnswers(
    reflection,
    reflection.prompts.map((_, question) => ({ question, value: null })),
  ).length,
  3,
);
// Published wording is immutable across releases: add v2, do not rewrite v1.
const v1Publications = DEVELOPMENT_CONTENT_V1.map((content) => ({
  content,
  responseOptions: REFLECTION_OPTIONS_V1,
}));
assert.equal(
  createHash("sha256").update(JSON.stringify(v1Publications)).digest("hex"),
  "1d17f7011033d75d4e0e35c90c040e2d4696b236781b676ac5eb6d8149e4aad4",
  "Published development v1 content and response options must stay unchanged",
);
const v1 = createDevelopmentContentRepository(v1Publications);
const oldPublication = v1.findLatest(reflection.key)!;
const revisedPrompts = [
  ...reflection.prompts,
  "Новый пункт следующей редакции",
];
const revisedOptions: string[] = [...REFLECTION_OPTIONS_V1];
const v2Publication = {
  content: { ...reflection, revision: 2, prompts: revisedPrompts },
  responseOptions: revisedOptions,
};
const v2 = createDevelopmentContentRepository([
  v2Publication,
  ...v1Publications,
]);
assert.equal(v1.findLatest(reflection.key)?.content.revision, 1);
assert.equal(v2.findLatest(reflection.key)?.content.revision, 2);
assert.deepEqual(v2.findRevision(reflection.key, 1), oldPublication);
assert.equal(v2.findRevision(reflection.key, 99), undefined);
assert.equal(v2.findRevision("missing-material", 1), undefined);
assert.equal(
  v2.listLatest().filter((item) => item.content.key === reflection.key).length,
  1,
);
const pinnedAnswers = oldPublication.content.prompts.map((_, question) => ({
  question,
  value: null,
}));
assert.equal(
  validateDevelopmentAnswers(
    v2.findRevision(reflection.key, 1)!.content,
    pinnedAnswers,
  ).length,
  3,
);
assert.throws(() =>
  validateDevelopmentAnswers(
    v2.findLatest(reflection.key)!.content,
    pinnedAnswers,
  ),
);
revisedPrompts[0] = "Caller mutation";
revisedOptions[0] = "Caller mutation";
assert.equal(
  v2.findLatest(reflection.key)?.content.prompts[0],
  reflection.prompts[0],
);
assert.equal(
  v2.findLatest(reflection.key)?.responseOptions[0],
  REFLECTION_OPTIONS_V1[0],
);
for (const value of [
  v2,
  v2.listLatest(),
  oldPublication,
  oldPublication.content,
  oldPublication.content.prompts,
  oldPublication.content.steps,
  oldPublication.responseOptions,
])
  assert.ok(Object.isFrozen(value));
assert.throws(() =>
  Object.defineProperty(oldPublication.content, "title", { value: "Changed" }),
);
assert.throws(
  () =>
    createDevelopmentContentRepository([...v1Publications, v1Publications[0]]),
  /DUPLICATE_DEVELOPMENT_PUBLICATION/,
);
assert.throws(
  () =>
    createDevelopmentContentRepository([
      { ...oldPublication, content: { ...reflection, revision: 0 } },
    ]),
  /INVALID_DEVELOPMENT_PUBLICATION_IDENTITY/,
);
assert.throws(
  () =>
    createDevelopmentContentRepository([
      { ...oldPublication, responseOptions: [] },
    ]),
  /INVALID_DEVELOPMENT_RESPONSE_OPTIONS/,
);
assert.equal(developmentPeriod(new Date("2026-09-06T23:59:59Z")), "2026-08-31");
assert.equal(developmentPeriod(new Date("2026-09-07T00:00:00Z")), "2026-09-07");
assert.equal(localDateSchema.safeParse("2026-02-30").success, false);
assert.equal(localDateSchema.safeParse("2028-02-29").success, true);
assert.equal(
  nextCalendarOccurrence("2026-01-31", "MONTHLY", "2026-02-01"),
  "2026-02-28",
);
assert.equal(
  nextCalendarOccurrence("2026-01-31", "MONTHLY", "2026-03-01"),
  "2026-03-31",
);
assert.equal(
  nextCalendarOccurrence("2024-02-29", "YEARLY", "2027-01-01"),
  "2027-02-28",
);
assert.equal(
  nextCalendarOccurrence("2024-02-29", "YEARLY", "2028-01-01"),
  "2028-02-29",
);
assert.equal(
  nextCalendarOccurrence("2026-09-01", "WEEKLY", "2026-09-02"),
  "2026-09-08",
);
assert.equal(nextCalendarOccurrence("2026-09-01", "NONE", "2026-09-02"), null);
const event = sharedLifeEntrySchema.parse({
  kind: "EVENT",
  title: "Повторение",
  date: "2026-01-31",
  repeat: "MONTHLY",
  lastCompletedDate: "2026-02-28",
});
assert.equal(nextEntryDate(event, "2026-02-10"), "2026-03-31");
assert.equal(
  sharedLifeEntrySchema.safeParse({
    kind: "TASK",
    title: "Дело",
    actorId: "spoof",
  }).success,
  false,
);
assert.equal(
  sharedLifeEntrySchema.safeParse({
    kind: "BUDGET",
    title: "Расход",
    date: "2026-09-05",
    amountMinor: 1.5,
    direction: "EXPENSE",
    currency: "RUB",
  }).success,
  false,
);
assert.equal(
  sharedLifeCommandSchema.safeParse({
    action: "DELETE",
    entryId: "not-a-uuid",
    expectedRevision: 0,
  }).success,
  false,
);
const expense = sharedLifeEntrySchema.parse({
  kind: "BUDGET",
  title: "Общее",
  date: "2026-09-05",
  amountMinor: 101,
  direction: "EXPENSE",
  currency: "RUB",
});
const income = sharedLifeEntrySchema.parse({
  kind: "BUDGET",
  title: "Взнос",
  date: "2026-09-05",
  amountMinor: 200,
  direction: "CONTRIBUTION",
  currency: "RUB",
});
const foreign = sharedLifeEntrySchema.parse({
  kind: "BUDGET",
  title: "Другое",
  date: "2026-09-05",
  amountMinor: 400,
  direction: "INCOME",
  currency: "KZT",
});
assert.deepEqual(
  summarizeBudget([expense, income, foreign]).map((item) => [
    item.currency,
    item.balanceMinor,
  ]),
  [
    ["RUB", 99],
    ["KZT", 400],
  ],
);
assert.equal(
  systemOccasions(
    {
      ...DEFAULT_SHARED_LIFE_SETTINGS,
      holidaysEnabled: false,
      authorEventsEnabled: false,
    },
    "2026-09-05",
  ).length,
  0,
);
const workspace = new PairWorkspace({
  _id: "workspace",
  revision: 1,
  settings: DEFAULT_SHARED_LIFE_SETTINGS,
  entries: [
    {
      id: "entry",
      data: expense,
      createdBy: "A",
      updatedBy: "B",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
});
assert.equal(workspace.validateSync(), undefined);
const dto = toSharedLifeDTO(workspace.toObject(), {
  myRole: "A",
  readOnly: false,
  today: "2026-09-05",
});
assert.equal(dto.entries[0].data.kind, "BUDGET");
assert.ok(!JSON.stringify(dto).includes("__v"));
const run = toDevelopmentRunDTO(
  {
    _id: "run",
    contentKey: "test",
    contentRevision: 1,
    periodKey: "2026-08-31",
    participantIds: ["owner", "peer"],
    completedUserIds: ["peer"],
    status: "PARTIAL",
    revision: 1,
    createdAt: new Date(),
  },
  "owner",
);
assert.equal(run.myCompletion, false);
assert.equal(run.partnerCompleted, true);
assert.ok(!JSON.stringify(run).includes("peer"));
console.log(
  "product-workspace selfcheck PASS: immutable v1 publication, exact/latest revisions, pinned validation, content coverage, calendar edges, explicit skips, strict input, currencies, DTO privacy.",
);
