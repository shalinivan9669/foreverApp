import type { PairActivityType } from '@/models/PairActivity';
import { isSafetyFallbackTemplateId } from '@/domain/services/safetyGate.service';
import { resolveActivityFactorBinding } from '@/domain/services/activityFactorRuntime.service';

export type PairMemberRole = 'A' | 'B';

const stateMetaString = (
  stateMeta: PairActivityType['stateMeta'],
  key: string
): string | undefined => {
  const value = stateMeta?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
};

const assignedMemberIds = (
  stateMeta: PairActivityType['stateMeta']
): string[] | undefined => {
  const value = stateMeta?.assignedMemberIds;
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === 'string');
};

export const hasEligibleActivityFactorBinding = (
  activity: Pick<PairActivityType, 'actionDefinition' | 'targetFactorKeys'>
): boolean => {
  try {
    const binding = resolveActivityFactorBinding(activity);
    return binding.factors.every(
      (factor) =>
        factor.privacyClass !== 'SENSITIVE' &&
        factor.privacyClass !== 'MATCHING_ONLY'
    );
  } catch {
    return false;
  }
};

export const activityTemplateId = (
  activity: Pick<PairActivityType, 'stateMeta'>
): string | undefined => stateMetaString(activity.stateMeta, 'templateId');

export const isActivityEligibleForSafetyState = (
  activity: Pick<PairActivityType, 'stateMeta'>,
  safetyVeto: boolean
): boolean =>
  !safetyVeto || isSafetyFallbackTemplateId(activityTemplateId(activity));

export const isActivityVisibleToRole = (
  activity: Pick<PairActivityType, 'visibility'>,
  role: PairMemberRole
): boolean => {
  if (activity.visibility === 'privateA') return role === 'A';
  if (activity.visibility === 'privateB') return role === 'B';
  return true;
};

export const isActivityAssignedToRole = (
  activity: Pick<PairActivityType, 'members' | 'mode' | 'stateMeta'>,
  role: PairMemberRole
): boolean => {
  const explicitAssignments = assignedMemberIds(activity.stateMeta);
  if (explicitAssignments) {
    const memberId = String(activity.members[role === 'A' ? 0 : 1]);
    return explicitAssignments.includes(memberId);
  }
  if (activity.mode === 'soloA') return role === 'A';
  if (activity.mode === 'soloB') return role === 'B';
  return true;
};

export const isActivityAccessibleToRole = (
  activity: Pick<
    PairActivityType,
    'members' | 'mode' | 'stateMeta' | 'visibility'
  >,
  role: PairMemberRole
): boolean =>
  isActivityVisibleToRole(activity, role) &&
  isActivityAssignedToRole(activity, role);

export const isOfferedActivityEligibleForRole = (input: {
  activity: Pick<
    PairActivityType,
    | 'actionDefinition'
    | 'targetFactorKeys'
    | 'members'
    | 'mode'
    | 'stateMeta'
    | 'visibility'
  >;
  role: PairMemberRole;
  safetyVeto: boolean;
}): boolean =>
  hasEligibleActivityFactorBinding(input.activity) &&
  isActivityEligibleForSafetyState(input.activity, input.safetyVeto) &&
  isActivityAccessibleToRole(input.activity, input.role);
