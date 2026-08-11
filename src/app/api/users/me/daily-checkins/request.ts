import { z } from 'zod';
import { hashIdempotencySensitiveValue } from '@/lib/idempotency/key';

const range01 = z.number().min(0).max(1);

const answersSchema = z
  .object({
    mood: z.enum([
      'calm',
      'warm',
      'tired',
      'anxious',
      'sad',
      'irritated',
      'closed',
      'open',
    ]),
    energy: range01,
    stress: range01,
    closenessNeed: range01,
    spaceNeed: range01,
    supportNeed: range01,
    conflictSensitivity: range01,
    conversationReadiness: range01,
  })
  .strict();

const contextSchema = z
  .object({
    sleep: z.enum(['good', 'medium', 'bad']).optional(),
    workload: z.enum(['low', 'medium', 'high']).optional(),
    body: z
      .object({
        enabled: z.boolean(),
        type: z.enum(['cycle', 'pain', 'fatigue', 'health', 'other']).optional(),
        note: z.string().max(500).optional(),
        visibility: z.literal('private'),
      })
      .strict()
      .optional(),
    customTags: z.array(z.string().max(40)).max(12).optional(),
  })
  .strict();

export const dailyCheckInBodySchema = z
  .object({
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    timezoneOffsetMin: z.number().optional(),
    answers: answersSchema,
    context: contextSchema.optional(),
    privateJournal: z
      .object({
        text: z.string().max(2000).optional(),
      })
      .strict()
      .optional(),
    share: z
      .object({
        partnerSignal: z
          .object({
            enabled: z.boolean(),
            text: z.string().max(300).optional(),
          })
          .strict()
          .optional(),
        pairMap: z
          .object({
            enabled: z.boolean(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type DailyCheckInBody = z.infer<typeof dailyCheckInBodySchema>;

export const dailyCheckInIdempotencyPayload = (body: DailyCheckInBody) => ({
  payloadDigest: hashIdempotencySensitiveValue([
    'daily-checkin-body-v1',
    {
      dateKey: body.dateKey ?? null,
      timezoneOffsetMin: body.timezoneOffsetMin ?? null,
      answers: { ...body.answers },
      context: body.context
        ? {
            sleep: body.context.sleep ?? null,
            workload: body.context.workload ?? null,
            body: body.context.body
              ? {
                  enabled: body.context.body.enabled,
                  type: body.context.body.type ?? null,
                  note: body.context.body.note ?? null,
                  visibility: body.context.body.visibility,
                }
              : null,
            customTags: [...(body.context.customTags ?? [])],
          }
        : null,
      privateJournal: body.privateJournal
        ? { text: body.privateJournal.text ?? null }
        : null,
      share: body.share
        ? {
            partnerSignal: body.share.partnerSignal
              ? {
                  enabled: body.share.partnerSignal.enabled,
                  text: body.share.partnerSignal.text ?? null,
                }
              : null,
            pairMap: body.share.pairMap
              ? { enabled: body.share.pairMap.enabled }
              : null,
          }
        : null,
    },
  ]),
});
