// DTO rule: return only DTO/view model (never raw DB model shape).
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';
import { withIdempotency } from '@/lib/idempotency/withIdempotency';
import { personalDailyCheckInService } from '@/domain/services/personalDailyCheckIn.service';

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

const bodySchema = z
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

export async function POST(req: NextRequest) {
  const auth = requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const body = await parseJson(req, bodySchema);
  if (!body.ok) return body.response;

  return withIdempotency({
    req,
    route: '/api/users/me/daily-checkins',
    userId: currentUserId,
    requestBody: {
      dateKey: body.data.dateKey ?? null,
      timezoneOffsetMin: body.data.timezoneOffsetMin ?? null,
      answers: body.data.answers,
      context: {
        sleep: body.data.context?.sleep ?? null,
        workload: body.data.context?.workload ?? null,
        body: body.data.context?.body
          ? {
              enabled: body.data.context.body.enabled,
              type: body.data.context.body.type ?? null,
              visibility: body.data.context.body.visibility,
              noteLength: body.data.context.body.note?.length ?? 0,
            }
          : null,
        customTagCount: body.data.context?.customTags?.length ?? 0,
      },
      privateJournalLength: body.data.privateJournal?.text?.length ?? 0,
      partnerSignal: body.data.share?.partnerSignal
        ? {
            enabled: body.data.share.partnerSignal.enabled,
            textLength: body.data.share.partnerSignal.text?.length ?? 0,
          }
        : null,
      pairMapEnabled: body.data.share?.pairMap?.enabled ?? false,
    },
    execute: () =>
      personalDailyCheckInService.submit({
        currentUserId,
        dateKey: body.data.dateKey,
        timezoneOffsetMin: body.data.timezoneOffsetMin,
        answers: body.data.answers,
        context: body.data.context,
        privateJournal: body.data.privateJournal,
        share: body.data.share,
      }),
  });
}
