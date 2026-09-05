import { z } from 'zod';

const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const codeSchema = z.object({ partnerCode: z.string().trim().toUpperCase().regex(/^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/) }).strict();
const confirmation = z.literal('THIS_IS_MY_PARTNER');

export const pairInviteLookupSchema = z.union([tokenSchema, codeSchema]);
export const pairInviteAcceptSchema = z.union([
  tokenSchema.extend({ confirmation }).strict(),
  codeSchema.extend({ confirmation }).strict(),
]);
export const pairInviteConfirmationSchema = z.object({
  partnerPublicId: z.string().trim().toUpperCase().regex(/^VM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/),
  confirmation,
}).strict();
