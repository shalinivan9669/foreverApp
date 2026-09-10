import { z } from 'zod';
import type { Facts, Phase, Track } from './engine/core';

export const AssessmentMissingReasonSchema = z.enum(['SKIPPED', 'NO_EXPERIENCE', 'NO_OPPORTUNITY', 'UNCLEAR', 'NONE_FITS', 'NOT_APPLICABLE']);
export const AssessmentResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('OPTION'), optionId: z.string().min(1).max(120) }).strict(),
  z.object({ kind: z.literal('FACTS'), values: z.record(z.boolean().nullable()).refine(value => Object.keys(value).length <= 40), episode: z.object({ observedAt: z.string().datetime(), sameEpisodeRootId: z.string().min(1).max(240).optional() }).strict().optional() }).strict(),
  z.object({ kind: z.literal('STRUCTURED'), slots: z.record(z.string().min(1).max(120)).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 16) }).strict(),
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
export interface AssessmentSlot { id: string; label: string; options: AssessmentOption[] }
export type AssessmentSkillId = 'DOM.S07' | 'COM.S02' | 'COM.S04';
export type AssessmentPurpose = 'OWNER' | 'MATCHING' | 'PAIR';
export type AssessmentExposureHistory = 'NOT_RECORDED' | 'EXPLANATION_RECORDED' | 'UNKNOWN_AFTER_DELETION';
export interface AssessmentItem {
  id: string; title: string; instructions: string;
  method: Exclude<Track, 'PARTNER_REPORT'>; track: 'K' | 'D' | 'A';
  familyId: string; rootSlot: string; kind: 'OPTION' | 'FACTS' | 'STRUCTURED';
  options: AssessmentOption[]; fields: AssessmentField[];
  slots?: AssessmentSlot[];
  changedInstructions?: string;
  dependsOn?: { itemId: string; optionId?: string };
  exposureFor?: string[];
}
export interface AssessmentPublication {
  id: string; version: string; skillId: AssessmentSkillId; title: string;
  status: 'DRAFT'; policyStatus: 'AUTHOR_POLICY_NOT_CALIBRATED';
  rubricVersion: string; contextKey: string; items: AssessmentItem[];
  terminalItemId: string; maxItems: number;
  metadata?: {
    responseSchemaVersion: 'assessment-response-v2'; interpretationVersion: 'author-beta-v1';
    usagePolicyVersion: 'beta-purpose-v1'; contentReview: 'INTERNAL_AUTHOR_REVIEW';
    allowedPurposes: AssessmentPurpose[]; compatibilityKey: string;
    samplingFrame: 'ASSIGNED_SCENES' | 'SELECTED_DESCRIBED_EPISODES';
    freshnessDays: number; explanation: string; authoredExplanation: string;
  };
}
