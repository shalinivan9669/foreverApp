import { z } from "zod";
import { jsonError } from "@/lib/api/response";

export const matchingIdSchema = z.string().trim().min(1).max(128);

const shortText = z.string().trim().min(1).max(80);
const questionText = z.string().trim().min(1).max(120);
const answerText = z.string().trim().min(1).max(280);
const factorKey = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._-]+$/);

export const idParamsSchema = z.object({ id: matchingIdSchema }).strict();

export const listQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const matchingCardBodySchema = z
  .object({
    requirements: z.tuple([shortText, shortText, shortText]),
    give: z.tuple([shortText, shortText, shortText]),
    questions: z.tuple([questionText, questionText, questionText]),
    boundaries: z.tuple([shortText, shortText, shortText]),
    boundaryDealbreakers: z.tuple([z.boolean(), z.boolean(), z.boolean()]),
    soughtGender: z.enum(["ANY", "male", "female"]).default("ANY"),
    ageRange: z
      .object({
        min: z.number().int().min(18).max(99),
        max: z.number().int().min(18).max(99),
      })
      .strict()
      .refine((value) => value.min <= value.max, {
        message: "Minimum age must not exceed maximum age",
        path: ["max"],
      }),
    maxDistanceKm: z.number().int().min(1).max(500),
    active: z.boolean(),
    actual: z
      .object({
        relationshipIntent: z.enum([
          "GETTING_TO_KNOW",
          "OPEN_TO_RELATIONSHIP",
          "LOOKING_FOR_LONG_TERM",
        ]),
        childrenIntent: z.enum(["YES", "NO", "UNSURE"]),
        structurePreference: z.number().min(-1).max(1).optional(),
        socialActivityPreference: z.number().min(-1).max(1).optional(),
        cleaningPreference: z.number().min(0).max(1).optional(),
        repairSkill: z.number().min(0).max(1).optional(),
        relationshipPriority: z.number().min(0).max(1).optional(),
      })
      .strict(),
  })
  .strict();

const factorTargetSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("SCALAR_RANGE"),
        minimum: z.number().finite(),
        maximum: z.number().finite(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("CATEGORICAL_SET"),
        allowedValues: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
      })
      .strict(),
    z
      .object({
        kind: z.literal("CONSTRAINT_SET"),
        allowedValues: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
      })
      .strict(),
    z
      .object({
        kind: z.literal("ROLE_TARGET"),
        desiredPreferenceMinimum: z.number().finite(),
        desiredPreferenceMaximum: z.number().finite(),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (value.kind === "SCALAR_RANGE" && value.minimum > value.maximum) {
      context.addIssue({
        code: "custom",
        message: "Minimum target must not exceed maximum target",
        path: ["maximum"],
      });
    }

    if (
      value.kind === "ROLE_TARGET" &&
      value.desiredPreferenceMinimum > value.desiredPreferenceMaximum
    ) {
      context.addIssue({
        code: "custom",
        message: "Minimum role target must not exceed maximum role target",
        path: ["desiredPreferenceMaximum"],
      });
    }
  });

export const matchingPreferencesBodySchema = z
  .object({
    revision: z.number().int().min(0),
    preferences: z
      .array(
        z
          .object({
            factorKey,
            target: factorTargetSchema,
            importance: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
            flexibility: z.enum([
              "FLEXIBLE",
              "PREFER",
              "IMPORTANT",
              "NON_NEGOTIABLE",
            ]),
            constraintMode: z.enum(["NONE", "SOFT", "HARD"]),
            useAllowed: z.boolean(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

const reactionsSchema = z.array(z.object({ section: z.enum(["give", "requirements", "boundaries"]), index: z.number().int().min(0).max(2), reaction: z.enum(["AGREE", "NEUTRAL", "AGAINST"]), note: z.string().trim().max(280).optional() }).strict()).max(9).optional();
const answersSchema = z.union([z.tuple([answerText, answerText, answerText]), z.tuple([answerText, answerText])]);

export const createLikeBodySchema = z
  .object({
    candidateId: matchingIdSchema,
    candidateGrant: z.string().trim().min(16).max(1024),
    agreements: z.tuple([z.literal(true), z.literal(true), z.literal(true)]),
    answers: answersSchema,
    reactions: reactionsSchema,
  })
  .strict();

export const respondLikeBodySchema = z
  .object({
    likeId: matchingIdSchema,
    agreements: z.tuple([z.literal(true), z.literal(true), z.literal(true)]),
    answers: answersSchema,
    reactions: reactionsSchema,
  })
  .strict();

export const likeDecisionBodySchema = z
  .object({ likeId: matchingIdSchema })
  .strict();

export const blockBodySchema = z
  .object({ blockedUserId: matchingIdSchema })
  .strict();

export const confirmationBodySchema = z
  .object({
    connectionId: matchingIdSchema,
    action: z.enum(["REQUEST", "CONFIRM", "CANCEL", "PAUSE", "RESUME", "CLOSE"]),
  })
  .strict();

const candidateGrantSchema = z.string().trim().min(16).max(1024);

export const readCandidateGrant = (
  req: Request,
): { ok: true; data: string } | { ok: false; response: Response } => {
  const parsed = candidateGrantSchema.safeParse(
    req.headers.get("x-candidate-grant"),
  );
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    response: jsonError(
      400,
      "CANDIDATE_GRANT_REQUIRED",
      "Candidate presentation grant is required",
    ),
  };
};
