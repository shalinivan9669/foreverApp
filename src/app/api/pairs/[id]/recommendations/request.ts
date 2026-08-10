import { z } from 'zod';

export const recommendationParamsSchema = z.object({ id: z.string().min(1) });

export const recommendationBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('offer') }).strict(),
  z.object({ action: z.literal('accept'), decisionId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('skip'), decisionId: z.string().min(1) }).strict(),
  z.object({ action: z.literal('replace'), decisionId: z.string().min(1) }).strict(),
]);
