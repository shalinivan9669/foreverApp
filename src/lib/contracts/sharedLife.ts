import { z } from "zod";

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "2200-12-31"
    );
  }, "Укажите существующую календарную дату.");
export const CURRENCIES = [
  "RUB",
  "KZT",
  "BYN",
  "USD",
  "EUR",
  "UZS",
  "KGS",
  "AMD",
  "GEL",
] as const;
export const REPEATS = ["NONE", "WEEKLY", "MONTHLY", "YEARLY"] as const;
const role = z.enum(["A", "B", "BOTH"]);
const base = {
  title: z.string().trim().min(1).max(160),
  note: z.string().trim().max(2000).default(""),
};
const status = z.enum(["OPEN", "DONE"]).default("OPEN");
export const sharedLifeEntrySchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("EVENT"),
      date: localDateSchema,
      repeat: z.enum(REPEATS).default("NONE"),
      lastCompletedDate: localDateSchema.optional(),
      place: z.string().trim().max(200).default(""),
      status,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("TASK"),
      date: localDateSchema.optional(),
      repeat: z.enum(REPEATS).default("NONE"),
      lastCompletedDate: localDateSchema.optional(),
      assignee: role.default("BOTH"),
      effortMinutes: z.number().int().min(0).max(1440).default(15),
      status,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("SHOPPING"),
      quantity: z.string().trim().max(100).default("1"),
      reservedBy: z.enum(["A", "B", "NONE"]).default("NONE"),
      status,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("GOAL"),
      date: localDateSchema.optional(),
      assignee: role.default("BOTH"),
      milestones: z
        .array(
          z
            .object({
              title: z.string().trim().min(1).max(160),
              done: z.boolean(),
            })
            .strict(),
        )
        .min(1)
        .max(20),
      status,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("BUDGET"),
      date: localDateSchema,
      direction: z.enum(["INCOME", "EXPENSE", "CONTRIBUTION"]),
      amountMinor: z.number().int().min(1).max(100_000_000_000),
      currency: z.enum(CURRENCIES),
      assignee: role.default("BOTH"),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("MEMORY"),
      date: localDateSchema,
      place: z.string().trim().max(200).default(""),
      photoLink: z
        .string()
        .url()
        .max(2000)
        .refine(
          (url) => url.startsWith("https://"),
          "Разрешены только HTTPS ссылки.",
        )
        .optional(),
    })
    .strict(),
]);
export type SharedLifeEntryInput = z.infer<typeof sharedLifeEntrySchema>;
export const sharedLifeSettingsSchema = z
  .object({
    relationshipStartDate: localDateSchema.optional(),
    holidaysEnabled: z.boolean(),
    authorEventsEnabled: z.boolean(),
    reminderLeadDays: z.number().int().min(0).max(30),
    defaultCurrency: z.enum(CURRENCIES),
  })
  .strict();
export type SharedLifeSettings = z.infer<typeof sharedLifeSettingsSchema>;
export const DEFAULT_SHARED_LIFE_SETTINGS: SharedLifeSettings = {
  holidaysEnabled: true,
  authorEventsEnabled: false,
  reminderLeadDays: 3,
  defaultCurrency: "RUB",
};
export const sharedLifeCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("SAVE"),
      expectedRevision: z.number().int().min(0),
      entryId: z.string().uuid(),
      data: sharedLifeEntrySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("DELETE"),
      expectedRevision: z.number().int().min(0),
      entryId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("SETTINGS"),
      expectedRevision: z.number().int().min(0),
      settings: sharedLifeSettingsSchema,
    })
    .strict(),
]);
export type SharedLifeCommand = z.infer<typeof sharedLifeCommandSchema>;
