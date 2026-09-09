import type { FactorDefinition, MeasurementDefinition, InstrumentDefinition } from './definitionTypes';

const preference = (key: string, domainKey: string, title: string, description: string, low: string, high: string): FactorDefinition => ({
  id: `factor.${key}`, key, domainKey, dimensionKey: `${domainKey}.agreements`, title, description,
  type: 'PREFERENCE_AXIS', valueSchema: { type: 'SCALAR', min: -1, max: 1 },
  semantics: { kind: 'BIPOLAR', lowPole: { key: 'in_moment', label: low }, midpointLabel: 'зависит от ситуации', highPole: { key: 'in_advance', label: high }, interpretation: 'NON_EVALUATIVE' },
  aggregationStrategy: { type: 'LATEST', minimumEvidence: 1 }, developmentPolicy: 'NEGOTIABLE',
  pairStrategies: [{ strategyVersion: 2, directionality: 'SYMMETRIC', context: 'COMMITTED_RELATIONSHIP', config: { type: 'BOUNDED_GAP', comfortableGap: 0.4, maximumGap: 1.2 }, minimumConfidence: 0.4, actionability: 'NEGOTIATION' }],
  privacyClass: domainKey === 'intimacy' ? 'SENSITIVE' : 'PRIVATE', contexts: ['SELF', 'COMMITTED_RELATIONSHIP'],
  confidenceRequirements: { minimumEvidenceReliability: 0.4, minimumSnapshotConfidence: 0.4, minimumPairConfidence: 0.4 }, freshnessPolicy: { type: 'NON_EXPIRING' },
  displayKeys: { titleKey: `factor.${key}.title`, descriptionKey: `factor.${key}.description`, explanationKey: `factor.${key}.explanation` }, definitionVersion: 1,
});

export const PROFILE_ADDITIONAL_FACTORS = [
  preference('finance.agreements.spendingDiscussion', 'finance', 'Обсуждение общих расходов', 'Предпочитаемый порядок обсуждения трат, затрагивающих общие планы; не оценка дохода или грамотности.', 'больше самостоятельности в согласованных пределах', 'больше предварительного согласования'),
  preference('intimacy.agreements.advanceDiscussion', 'intimacy', 'Обсуждение близости и границ', 'Комфортный момент для разговора о близости. Любой выбор сохраняет добровольность и право отказаться.', 'обсуждать в моменте', 'обсуждать заранее'),
] as const;

export const PROFILE_MEASUREMENT_BINDINGS = [
  ['conversation.pause', 'communication.conflict.repairSkill', 0.65],
  ['conversation.misunderstanding', 'communication.conflict.repairSkill', 0.65],
  ['planning.time', 'sharedLife.planning.structurePreference', 0.9],
  ['priorities.time', 'sharedLife.values.relationshipPriority', 0.9],
  ['money.discussion', 'finance.agreements.spendingDiscussion', 0.9],
  ['boundaries.discussion', 'intimacy.agreements.advanceDiscussion', 0.9],
  ['recovery.load', 'wellbeing.current.overload', 0.85],
] as const;

export function profileMeasurements(factors: readonly FactorDefinition[]): MeasurementDefinition[] {
  return PROFILE_MEASUREMENT_BINDINGS.map(([key, factorKey, reliability]) => {
    const factor = factors.find((item) => item.key === factorKey);
    if (!factor) throw new Error('PROFILE_DEFINITION_MISSING');
    return { id: `measurement.profile.${key}`, key: `profile.${key}`, factorKey, sourceType: 'QUESTIONNAIRE', valueSchema: factor.valueSchema, normalization: { type: 'IDENTITY' }, reliability, measurementVersion: 1 };
  });
}

export const PROFILE_INSTRUMENT: InstrumentDefinition = {
  id: 'instrument.profileTests', key: 'profile.tests.v1', title: 'Личные ориентиры: авторские анкеты самоотчёта', context: 'SELF',
  measurementKeys: PROFILE_MEASUREMENT_BINDINGS.map(([key]) => `profile.${key}`), instrumentVersion: 1,
};
