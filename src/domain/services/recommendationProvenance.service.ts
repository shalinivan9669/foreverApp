import { createHash } from 'node:crypto';
import type { PairActivityType } from '@/models/PairActivity';
import {
  ACTIVITY_CONTENT_VERSION,
  RECOMMENDATION_PROVENANCE_VERSION,
  RECOMMENDATION_RULE_VERSION,
  type RecommendationProvenanceType,
  type RecommendationSummaryContext,
} from '@/models/RecommendationProvenance';

type ActivityContentSource = Pick<
  PairActivityType,
  | 'intent'
  | 'archetype'
  | 'actionDefinition'
  | 'targetFactorKeys'
  | 'title'
  | 'description'
  | 'why'
  | 'mode'
  | 'sync'
  | 'difficulty'
  | 'intensity'
  | 'timeEstimateMin'
  | 'costEstimate'
  | 'location'
  | 'materials'
  | 'requiresConsent'
  | 'checkIns'
>;

const localized = (value?: { ru?: string; en?: string }) => ({
  ru: value?.ru ?? '',
  en: value?.en ?? '',
});

export const buildActivityContentHash = (
  activity: ActivityContentSource
): string => {
  const canonicalContent = {
    intent: activity.intent,
    archetype: activity.archetype,
    actionDefinition: activity.actionDefinition,
    targetFactorKeys: [...activity.targetFactorKeys].sort(),
    title: localized(activity.title),
    description: localized(activity.description),
    why: localized(activity.why),
    mode: activity.mode,
    sync: activity.sync,
    difficulty: activity.difficulty,
    intensity: activity.intensity,
    timeEstimateMin: activity.timeEstimateMin ?? null,
    costEstimate: activity.costEstimate ?? null,
    location: activity.location ?? null,
    materials: activity.materials ?? [],
    requiresConsent: activity.requiresConsent === true,
    checkIns: activity.checkIns.map((checkIn) => ({
      id: checkIn.id,
      scale: checkIn.scale,
      map: checkIn.map,
      text: localized(checkIn.text),
      successThreshold: checkIn.successThreshold ?? null,
      weight: checkIn.weight ?? null,
    })),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalContent), 'utf8')
    .digest('hex');
};

export const buildRecommendationProvenance = (input: {
  context: RecommendationSummaryContext;
  activity: ActivityContentSource;
}): RecommendationProvenanceType => ({
  version: RECOMMENDATION_PROVENANCE_VERSION,
  ...input.context,
  recommendationRuleVersion: RECOMMENDATION_RULE_VERSION,
  activityContentVersion: ACTIVITY_CONTENT_VERSION,
  activityContentHash: buildActivityContentHash(input.activity),
});

export const recommendationProvenanceMatchesContext = (
  provenance: RecommendationProvenanceType | undefined,
  context: RecommendationSummaryContext
): boolean =>
  Boolean(
    provenance &&
      String(provenance.cycleId) === String(context.cycleId) &&
      provenance.cycleKey === context.cycleKey &&
      String(provenance.snapshotId) === String(context.snapshotId) &&
      provenance.snapshotRevision === context.snapshotRevision &&
      provenance.inputHash === context.inputHash &&
      provenance.inputDefinitionVersion === context.inputDefinitionVersion &&
      provenance.pairStateAlgorithmVersion ===
        context.pairStateAlgorithmVersion
  );
