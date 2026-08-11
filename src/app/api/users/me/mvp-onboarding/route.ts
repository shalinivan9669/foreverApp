// Owner-only DTO route. The authenticated session is the sole access subject.
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { asError, toDomainError } from '@/domain/errors';
import {
  mvpOnboardingService,
  type MvpOnboardingMutationInput,
} from '@/domain/services/mvpOnboarding.service';
import { jsonError, jsonOk } from '@/lib/api/response';
import { requireSession } from '@/lib/auth/guards';
import { parseJson } from '@/lib/api/validate';

const answerValueSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('single'),
      optionId: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({
      kind: z.literal('multi'),
      optionIds: z.array(z.string().min(1).max(80)).min(1).max(4),
    })
    .strict(),
  z
    .object({
      kind: z.literal('boolean'),
      booleanValue: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('skipped') }).strict(),
]);

const mutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('start'),
      contentRevision: z.string().min(1).max(100),
      policyVersion: z.string().min(1).max(100),
      consent: z
        .object({
          adultConfirmed: z.boolean(),
          voluntaryParticipationConfirmed: z.boolean(),
          privacyAcknowledged: z.boolean(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal('answer'),
      questionId: z.string().min(1).max(100),
      questionRevision: z.string().min(1).max(100),
      capturePolicy: z.enum(['PRIVATE', 'PAIR_MODEL_ONLY', 'SHARED']),
      value: answerValueSchema,
    })
    .strict(),
  z.object({ action: z.literal('complete') }).strict(),
]);

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;

  try {
    const response = jsonOk(
      await mvpOnboardingService.getOwnerState({
        currentUserId: auth.data.userId,
      })
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error: unknown) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  const currentUserId = auth.data.userId;

  const body = await parseJson(req, mutationSchema);
  if (!body.ok) return body.response;
  const mutation: MvpOnboardingMutationInput = body.data;

  try {
    const response = jsonOk(
      await mvpOnboardingService.mutate({
        currentUserId,
        mutation,
      })
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error: unknown) {
    const domainError = toDomainError(asError(error));
    return jsonError(
      domainError.status,
      domainError.code,
      domainError.message,
      domainError.details
    );
  }
}
