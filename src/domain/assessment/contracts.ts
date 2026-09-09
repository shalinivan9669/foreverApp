import { z } from 'zod';
import type { Facts, Phase, Track } from './engine/core';

export const AssessmentMissingReasonSchema = z.enum(['SKIPPED', 'NO_EXPERIENCE', 'NO_OPPORTUNITY', 'UNCLEAR']);
export const AssessmentResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('OPTION'), optionId: z.string().min(1).max(120) }).strict(),
  z.object({ kind: z.literal('FACTS'), values: z.record(z.boolean().nullable()).refine(value => Object.keys(value).length <= 40) }).strict(),
  z.object({ kind: z.literal('MISSING'), reason: AssessmentMissingReasonSchema }).strict(),
]);
export const AssessmentAnswerInputSchema = z.object({
  presentationId: z.string().min(1).max(120), expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(120), response: AssessmentResponseSchema,
}).strict();
export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;
export type AssessmentAnswerInput = z.infer<typeof AssessmentAnswerInputSchema>;
export interface AssessmentAnswerRecord {
  presentationId: string; itemId: string; response: AssessmentResponse;
  revision: number; phase: Phase; recordedAt: string;
}
export interface AssessmentPeriod { id: string; startsAt: string; endsAt: string }
export interface AssessmentOption { id: string; label: string; facts: Facts }
export interface AssessmentField { id: string; label: string; factKey: string; group: string }
export interface AssessmentItem {
  id: string; title: string; instructions: string;
  method: Exclude<Track, 'PARTNER_REPORT'>; track: 'K' | 'D' | 'A';
  familyId: string; rootSlot: string; kind: 'OPTION' | 'FACTS';
  options: AssessmentOption[]; fields: AssessmentField[];
  dependsOn?: { itemId: string; optionId: string };
  exposureFor?: string[];
}
export interface AssessmentPublication {
  id: string; version: string; skillId: 'DOM.S07'; title: string;
  status: 'DRAFT'; policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED';
  rubricVersion: string; contextKey: string; items: AssessmentItem[];
  terminalItemId: string; maxItems: number;
}
