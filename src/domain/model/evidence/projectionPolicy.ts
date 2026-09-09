import type { EvidenceEvent, EvidencePurpose } from './evidence';

/** Reading one's own self-report is distinct from permission to use it elsewhere. */
export function permitsIndividualProjection(event: EvidenceEvent, purpose: EvidencePurpose): boolean {
  if (event.subjectKind !== 'INDIVIDUAL' || event.observationScope !== 'SELF' || event.actorId !== event.subjectId) return false;
  if (purpose === 'OWNER_PROFILE') return event.captureMode !== 'SYSTEM_ONLY' && event.purpose !== 'SAFETY';
  if (event.purpose !== purpose) return false;
  if (purpose === 'SAFETY') return event.captureMode === 'SYSTEM_ONLY';
  return event.captureMode === 'PAIR_MODEL_ONLY' || event.captureMode === 'SHARED';
}
