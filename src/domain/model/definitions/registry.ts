import { createHash } from 'node:crypto';
import {
  validatePairStrategyDefinition,
} from '@/domain/model/pair/strategies';
import type { PairStrategyConfig } from '@/domain/model/pair/strategyTypes';
import type { ValueSchema } from '@/domain/model/values/factorValue';
import type {
  ActionDefinition,
  AggregationStrategy,
  FactorRegistryDefinitionSet,
  FactorRegistryRelease,
  NormalizationRule,
  UnhashedFactorRegistryRelease,
} from '@/domain/model/definitions/definitionTypes';

export type RegistryValidationReasonCode =
  | 'REGISTRY_KEY_INVALID'
  | 'REGISTRY_VERSION_INVALID'
  | 'ALGORITHM_VERSION_INVALID'
  | 'SNAPSHOT_VERSION_INVALID'
  | 'DISPLAY_VERSION_INVALID'
  | 'DEFINITION_ID_DUPLICATE'
  | 'DEFINITION_KEY_DUPLICATE'
  | 'DEFINITION_KEY_INVALID'
  | 'DEFINITION_VERSION_INVALID'
  | 'DOMAIN_REFERENCE_MISSING'
  | 'DIMENSION_REFERENCE_MISSING'
  | 'FACTOR_REFERENCE_MISSING'
  | 'MEASUREMENT_REFERENCE_MISSING'
  | 'CONTEXT_REFERENCE_MISSING'
  | 'VALUE_SCHEMA_INVALID'
  | 'AGGREGATION_STRATEGY_INVALID'
  | 'FACTOR_POLICY_INVALID'
  | 'FACTOR_SEMANTICS_INVALID'
  | 'CONFIDENCE_REQUIREMENTS_INVALID'
  | 'FRESHNESS_POLICY_INVALID'
  | 'DISPLAY_KEYS_INVALID'
  | 'PAIR_STRATEGY_INVALID'
  | 'PAIR_STRATEGY_CONFIDENCE_BELOW_FACTOR_MINIMUM'
  | 'ACTION_SKILL_REFERENCE_INVALID';

export type RegistryValidationResult =
  | { valid: true }
  | {
      valid: false;
      issues: readonly {
        reasonCode: RegistryValidationReasonCode;
        definitionKey: string;
      }[];
    };

export class FactorRegistryValidationError extends Error {
  readonly issues: readonly {
    reasonCode: RegistryValidationReasonCode;
    definitionKey: string;
  }[];

  constructor(
    issues: readonly {
      reasonCode: RegistryValidationReasonCode;
      definitionKey: string;
    }[]
  ) {
    super(`Factor registry validation failed with ${issues.length} issue(s)`);
    this.name = 'FactorRegistryValidationError';
    this.issues = issues;
  }
}

const keyPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;
const encodeString = (value: string): string => JSON.stringify(value);
const encodeNumber = (value: number): string =>
  Number.isFinite(value) ? String(value) : 'non-finite';
const encodeStrings = (values: readonly string[]): string =>
  [...values].sort().map(encodeString).join(',');

const encodeValueSchema = (schema: ValueSchema): string => {
  switch (schema.type) {
    case 'SCALAR':
    case 'RANGE':
      return `${schema.type}(${encodeNumber(schema.min)},${encodeNumber(schema.max)})`;
    case 'BOOLEAN':
      return 'BOOLEAN';
    case 'CATEGORY':
      return `CATEGORY(${encodeStrings(schema.allowedValues)})`;
    case 'ORDINAL':
      return `ORDINAL(${[...schema.levels]
        .sort((a, b) => a.rank - b.rank || a.value.localeCompare(b.value))
        .map(
          (level) =>
            `${level.rank}:${encodeString(level.value)}:${encodeString(level.label)}`
        )
        .join(',')})`;
    case 'CONSTRAINT':
      return `CONSTRAINT(${encodeStrings(schema.allowedValues)})`;
    case 'MASTERY':
      return `MASTERY(${encodeNumber(schema.basicMaxExclusive)},${encodeNumber(
        schema.intermediateMaxExclusive
      )})`;
    case 'SET':
      return `SET(${encodeStrings(schema.allowedValues)};${schema.minItems};${schema.maxItems})`;
    case 'TEXT':
      return `TEXT(${schema.minLength},${schema.maxLength})`;
  }
};

const encodeAggregation = (strategy: AggregationStrategy): string => {
  switch (strategy.type) {
    case 'LATEST':
    case 'NON_AGGREGATING':
      return `${strategy.type}(${strategy.minimumEvidence})`;
    case 'WEIGHTED_MEAN':
    case 'MAJORITY':
      return `${strategy.type}(${strategy.minimumEvidence},${strategy.expectedEvidence})`;
    case 'RECENCY_WEIGHTED':
      return `${strategy.type}(${strategy.minimumEvidence},${strategy.expectedEvidence},${strategy.halfLifeDays})`;
  }
};

const encodeSemantics = (
  semantics: FactorRegistryDefinitionSet['factors'][number]['semantics']
): string => {
  const pole = (value: { key: string; label: string }): string =>
    `${encodeString(value.key)}:${encodeString(value.label)}`;
  switch (semantics.kind) {
    case 'BIPOLAR':
      return `BIPOLAR(${pole(semantics.lowPole)};${encodeString(
        semantics.midpointLabel
      )};${pole(semantics.highPole)};${semantics.interpretation})`;
    case 'ORDERED':
      return `ORDERED(${pole(semantics.lowPole)};${pole(
        semantics.highPole
      )};${semantics.labels.map(pole).join(',')};${semantics.interpretation})`;
    case 'CATEGORICAL':
      return `CATEGORICAL(${[...semantics.labels]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(pole)
        .join(',')};${semantics.interpretation})`;
  }
};

const encodeFreshness = (
  policy: FactorRegistryDefinitionSet['factors'][number]['freshnessPolicy']
): string =>
  policy.type === 'NON_EXPIRING'
    ? policy.type
    : `${policy.type}(${policy.halfLifeDays},${policy.expiresAfterDays})`;

const encodePairConfig = (config: PairStrategyConfig): string => {
  switch (config.type) {
    case 'SIMILARITY':
      return `${config.type}(${config.maximumDistance})`;
    case 'BOUNDED_GAP':
      return `${config.type}(${config.comfortableGap},${config.maximumGap})`;
    case 'TARGET_RANGE':
      return `${config.type}(${config.targetMin},${config.targetMax})`;
    case 'COMPLEMENT':
      return `${config.type}(${config.idealGap},${config.tolerance})`;
    case 'BOUNDED_COMPLEMENT':
      return `${config.type}(${config.minimumUsefulGap},${config.idealGap},${config.maximumGap})`;
    case 'MINIMUM_BOTH':
      return `${config.type}(${config.minimum})`;
    case 'ROLE_COVERAGE':
      return `${config.type}(${config.minimumCoverage},${config.maximumLoadImbalance})`;
    case 'DIRECTIONAL_EXPECTATION':
      return `${config.type}(${config.maximumDistanceFromRange})`;
    case 'CUSTOM_MATRIX':
      return `${config.type}(${[...config.entries]
        .sort((a, b) => `${a.a}:${a.b}`.localeCompare(`${b.a}:${b.b}`))
        .map((entry) =>
          `${encodeString(entry.a)}>${encodeString(entry.b)}:${entry.fit}:${entry.status}`
        )
        .join(',')})`;
    case 'HARD_CONSTRAINT':
      return `${config.type}(${[...config.allowedPairs]
        .sort((a, b) => `${a.a}:${a.b}`.localeCompare(`${b.a}:${b.b}`))
        .map((entry) => `${encodeString(entry.a)}>${encodeString(entry.b)}`)
        .join(',')})`;
  }
};

const encodeNormalization = (normalization: NormalizationRule): string => {
  switch (normalization.type) {
    case 'IDENTITY':
      return 'IDENTITY';
    case 'LINEAR_SCALE':
      return `${normalization.type}(${normalization.inputMin},${normalization.inputMax},${normalization.outputMin},${normalization.outputMax})`;
    case 'REVERSE_SCALAR':
      return `${normalization.type}(${normalization.min},${normalization.max})`;
  }
};

const encodeAction = (action: ActionDefinition): string => {
  const contraindications = [...action.contraindications]
    .map((item) => {
      switch (item.type) {
        case 'FACTOR_AT_OR_ABOVE':
        case 'FACTOR_AT_OR_BELOW':
          return `${item.type}:${item.factorKey}:${item.threshold}`;
        case 'FACTOR_STATUS':
          return `${item.type}:${item.factorKey}:${item.status}`;
      }
    })
    .sort()
    .join(',');
  return [
    action.id,
    action.key,
    action.title,
    action.description,
    encodeStrings(action.targetFactors),
    action.minimumSkillLevel ?? '',
    action.minimumSkillFactorKey ?? '',
    encodeStrings(action.contexts),
    encodeStrings(action.expectedOutcomes),
    contraindications,
    action.difficulty,
    action.durationMinutes,
    action.cooldownDays,
    action.feedbackSchemaKey,
    action.publicationVersion,
    action.actionVersion,
  ].map(String).join('|');
};

export function canonicalizeFactorRegistry(
  release: UnhashedFactorRegistryRelease | FactorRegistryRelease
): string {
  const lines: string[] = [
    `release|${release.registryKey}|${release.registryVersion}|${release.algorithmVersion}|${release.snapshotVersion}|${release.displayVersion}|${release.status}`,
  ];
  for (const domain of [...release.domains].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(
      `domain|${domain.id}|${domain.key}|${domain.title}|${domain.description}|${domain.order}|${domain.version}`
    );
  }
  for (const dimension of [...release.dimensions].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(
      `dimension|${dimension.id}|${dimension.key}|${dimension.domainKey}|${dimension.title}|${dimension.description}|${dimension.order}|${dimension.version}`
    );
  }
  for (const factor of [...release.factors].sort((a, b) => a.key.localeCompare(b.key))) {
    const pairStrategies = [...factor.pairStrategies]
      .sort((a, b) =>
        `${a.context}:${a.config.type}:${a.strategyVersion}:${a.directionality}`.localeCompare(
          `${b.context}:${b.config.type}:${b.strategyVersion}:${b.directionality}`
        )
      )
      .map((strategy) =>
        `${strategy.context}:${strategy.strategyVersion}:${strategy.directionality}:${encodePairConfig(strategy.config)}:${strategy.minimumConfidence}:${strategy.actionability}`
      )
      .join(',');
    lines.push(
      [
        'factor',
        factor.id,
        factor.key,
        factor.domainKey,
        factor.dimensionKey,
        factor.title,
        factor.description,
        factor.type,
        encodeValueSchema(factor.valueSchema),
        encodeSemantics(factor.semantics),
        encodeAggregation(factor.aggregationStrategy),
        factor.developmentPolicy,
        pairStrategies,
        factor.privacyClass,
        encodeStrings(factor.contexts),
        factor.confidenceRequirements.minimumEvidenceReliability,
        factor.confidenceRequirements.minimumSnapshotConfidence,
        factor.confidenceRequirements.minimumPairConfidence,
        encodeFreshness(factor.freshnessPolicy),
        factor.displayKeys.titleKey,
        factor.displayKeys.descriptionKey,
        factor.displayKeys.explanationKey,
        factor.definitionVersion,
      ].map(String).join('|')
    );
  }
  for (const measurement of [...release.measurements].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(
      [
        'measurement',
        measurement.id,
        measurement.key,
        measurement.factorKey,
        measurement.sourceType,
        encodeValueSchema(measurement.valueSchema),
        encodeNormalization(measurement.normalization),
        measurement.reliability,
        measurement.measurementVersion,
      ].map(String).join('|')
    );
  }
  for (const instrument of [...release.instruments].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(
      [
        'instrument',
        instrument.id,
        instrument.key,
        instrument.title,
        instrument.context,
        encodeStrings(instrument.measurementKeys),
        instrument.instrumentVersion,
      ].map(String).join('|')
    );
  }
  for (const action of [...release.actions].sort((a, b) => a.key.localeCompare(b.key))) {
    lines.push(`action|${encodeAction(action)}`);
  }
  return lines.join('\n');
}

export const hashFactorRegistry = (
  release: UnhashedFactorRegistryRelease | FactorRegistryRelease
): string =>
  createHash('sha256').update(canonicalizeFactorRegistry(release)).digest('hex');

const validateValueSchema = (schema: ValueSchema): boolean => {
  switch (schema.type) {
    case 'SCALAR':
    case 'RANGE':
      return Number.isFinite(schema.min) && Number.isFinite(schema.max) && schema.min < schema.max;
    case 'BOOLEAN':
      return true;
    case 'CATEGORY':
      return schema.allowedValues.length > 0 && new Set(schema.allowedValues).size === schema.allowedValues.length;
    case 'ORDINAL': {
      const ordered = [...schema.levels].sort((a, b) => a.rank - b.rank);
      return (
        ordered.length > 0 &&
        new Set(ordered.map((level) => level.value)).size === ordered.length &&
        new Set(ordered.map((level) => level.rank)).size === ordered.length &&
        ordered.every(
          (level, index) =>
            Boolean(level.value) &&
            Boolean(level.label) &&
            Number.isInteger(level.rank) &&
            level.rank === index
        )
      );
    }
    case 'CONSTRAINT':
      return (
        schema.allowedValues.length > 0 &&
        new Set(schema.allowedValues).size === schema.allowedValues.length
      );
    case 'MASTERY':
      return schema.basicMaxExclusive > 0 &&
        schema.basicMaxExclusive < schema.intermediateMaxExclusive &&
        schema.intermediateMaxExclusive < 1;
    case 'SET':
      return schema.allowedValues.length > 0 &&
        new Set(schema.allowedValues).size === schema.allowedValues.length &&
        schema.minItems >= 0 &&
        schema.maxItems >= schema.minItems &&
        schema.maxItems <= schema.allowedValues.length;
    case 'TEXT':
      return schema.minLength >= 0 && schema.maxLength >= schema.minLength;
  }
};

const validSemanticPole = (pole: { key: string; label: string }): boolean =>
  keyPattern.test(pole.key) && Boolean(pole.label.trim());

const validateFactorSemantics = (
  factor: FactorRegistryDefinitionSet['factors'][number]
): boolean => {
  const semantics = factor.semantics;
  if (semantics.kind === 'BIPOLAR') {
    return (
      (factor.valueSchema.type === 'SCALAR' ||
        factor.valueSchema.type === 'RANGE') &&
      validSemanticPole(semantics.lowPole) &&
      validSemanticPole(semantics.highPole) &&
      semantics.lowPole.key !== semantics.highPole.key &&
      Boolean(semantics.midpointLabel.trim())
    );
  }
  const labels = semantics.labels;
  if (
    labels.some((label) => !validSemanticPole(label)) ||
    new Set(labels.map((label) => label.key)).size !== labels.length
  ) {
    return false;
  }
  if (semantics.kind === 'ORDERED') {
    return (
      factor.valueSchema.type !== 'CATEGORY' &&
      factor.valueSchema.type !== 'CONSTRAINT' &&
      factor.valueSchema.type !== 'SET' &&
      factor.valueSchema.type !== 'TEXT' &&
      validSemanticPole(semantics.lowPole) &&
      validSemanticPole(semantics.highPole) &&
      semantics.lowPole.key !== semantics.highPole.key
    );
  }
  const allowedValues =
    factor.valueSchema.type === 'CATEGORY' ||
    factor.valueSchema.type === 'CONSTRAINT'
      ? factor.valueSchema.allowedValues
      : [];
  return (
    allowedValues.length > 0 &&
    labels.length === allowedValues.length &&
    labels.every((label) => allowedValues.includes(label.key))
  );
};

const validateConfidenceRequirements = (
  factor: FactorRegistryDefinitionSet['factors'][number]
): boolean =>
  Object.values(factor.confidenceRequirements).every(
    (value) => Number.isFinite(value) && value >= 0 && value <= 1
  );

const validateFreshnessPolicy = (
  factor: FactorRegistryDefinitionSet['factors'][number]
): boolean => {
  const policy = factor.freshnessPolicy;
  if (policy.type === 'NON_EXPIRING') return factor.type !== 'STATE';
  return (
    Number.isFinite(policy.halfLifeDays) &&
    policy.halfLifeDays > 0 &&
    Number.isFinite(policy.expiresAfterDays) &&
    policy.expiresAfterDays >= policy.halfLifeDays
  );
};

const validateDisplayKeys = (
  factor: FactorRegistryDefinitionSet['factors'][number]
): boolean =>
  Object.values(factor.displayKeys).every((value) => keyPattern.test(value));

const validateAggregation = (strategy: AggregationStrategy): boolean => {
  if (!Number.isInteger(strategy.minimumEvidence) || strategy.minimumEvidence < 1) {
    return false;
  }
  switch (strategy.type) {
    case 'LATEST':
    case 'NON_AGGREGATING':
      return true;
    case 'WEIGHTED_MEAN':
    case 'MAJORITY':
      return Number.isInteger(strategy.expectedEvidence) &&
        strategy.expectedEvidence >= strategy.minimumEvidence;
    case 'RECENCY_WEIGHTED':
      return Number.isInteger(strategy.expectedEvidence) &&
        strategy.expectedEvidence >= strategy.minimumEvidence &&
        Number.isFinite(strategy.halfLifeDays) &&
        strategy.halfLifeDays > 0;
  }
};

const collectDuplicates = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
};

export function validateFactorRegistry(
  release: UnhashedFactorRegistryRelease | FactorRegistryRelease
): RegistryValidationResult {
  const issues: {
    reasonCode: RegistryValidationReasonCode;
    definitionKey: string;
  }[] = [];
  const add = (
    reasonCode: RegistryValidationReasonCode,
    definitionKey: string
  ) => issues.push({ reasonCode, definitionKey });

  if (!keyPattern.test(release.registryKey)) add('REGISTRY_KEY_INVALID', release.registryKey);
  if (!Number.isInteger(release.registryVersion) || release.registryVersion < 1) add('REGISTRY_VERSION_INVALID', release.registryKey);
  if (!Number.isInteger(release.algorithmVersion) || release.algorithmVersion < 1) add('ALGORITHM_VERSION_INVALID', release.registryKey);
  if (!Number.isInteger(release.snapshotVersion) || release.snapshotVersion < 1) add('SNAPSHOT_VERSION_INVALID', release.registryKey);
  if (!Number.isInteger(release.displayVersion) || release.displayVersion < 1) add('DISPLAY_VERSION_INVALID', release.registryKey);

  const sets: readonly (readonly { id: string; key: string }[])[] = [
    release.domains,
    release.dimensions,
    release.factors,
    release.measurements,
    release.instruments,
    release.actions,
  ];
  for (const duplicate of collectDuplicates(sets.flatMap((set) => set.map((item) => item.id)))) {
    add('DEFINITION_ID_DUPLICATE', duplicate);
  }
  for (const set of sets) {
    for (const duplicate of collectDuplicates(set.map((item) => item.key))) {
      add('DEFINITION_KEY_DUPLICATE', duplicate);
    }
    for (const item of set) {
      if (!keyPattern.test(item.key)) add('DEFINITION_KEY_INVALID', item.key);
    }
  }

  const domainKeys = new Set(release.domains.map((item) => item.key));
  const dimensionKeys = new Set(release.dimensions.map((item) => item.key));
  const factorKeys = new Set(release.factors.map((item) => item.key));
  const measurementKeys = new Set(release.measurements.map((item) => item.key));

  for (const domain of release.domains) {
    if (!Number.isInteger(domain.version) || domain.version < 1) add('DEFINITION_VERSION_INVALID', domain.key);
  }
  for (const dimension of release.dimensions) {
    if (!domainKeys.has(dimension.domainKey)) add('DOMAIN_REFERENCE_MISSING', dimension.key);
    if (!Number.isInteger(dimension.version) || dimension.version < 1) add('DEFINITION_VERSION_INVALID', dimension.key);
  }
  for (const factor of release.factors) {
    if (!domainKeys.has(factor.domainKey)) add('DOMAIN_REFERENCE_MISSING', factor.key);
    if (!dimensionKeys.has(factor.dimensionKey)) add('DIMENSION_REFERENCE_MISSING', factor.key);
    if (!validateValueSchema(factor.valueSchema)) add('VALUE_SCHEMA_INVALID', factor.key);
    if (!validateFactorSemantics(factor)) add('FACTOR_SEMANTICS_INVALID', factor.key);
    if (!validateAggregation(factor.aggregationStrategy)) add('AGGREGATION_STRATEGY_INVALID', factor.key);
    if (!validateConfidenceRequirements(factor)) {
      add('CONFIDENCE_REQUIREMENTS_INVALID', factor.key);
    }
    if (!validateFreshnessPolicy(factor)) add('FRESHNESS_POLICY_INVALID', factor.key);
    if (!validateDisplayKeys(factor)) add('DISPLAY_KEYS_INVALID', factor.key);
    if (!Number.isInteger(factor.definitionVersion) || factor.definitionVersion < 1) add('DEFINITION_VERSION_INVALID', factor.key);
    if (factor.type === 'SKILL' && (factor.valueSchema.type !== 'MASTERY' || factor.developmentPolicy !== 'TRAINABLE')) {
      add('FACTOR_POLICY_INVALID', factor.key);
    }
    if (factor.type === 'STATE' && factor.developmentPolicy !== 'STATE_MANAGEMENT') {
      add('FACTOR_POLICY_INVALID', factor.key);
    }
    if (
      factor.type === 'CONSTRAINT' &&
      (factor.valueSchema.type !== 'CONSTRAINT' ||
        factor.aggregationStrategy.type !== 'NON_AGGREGATING' ||
        factor.developmentPolicy !== 'FIXED_CONSTRAINT')
    ) {
      add('FACTOR_POLICY_INVALID', factor.key);
    }
    for (const strategy of factor.pairStrategies) {
      if (!factor.contexts.includes(strategy.context)) add('CONTEXT_REFERENCE_MISSING', factor.key);
      if (!validatePairStrategyDefinition(strategy).valid) add('PAIR_STRATEGY_INVALID', factor.key);
      if (
        strategy.minimumConfidence <
        factor.confidenceRequirements.minimumPairConfidence
      ) {
        add('PAIR_STRATEGY_CONFIDENCE_BELOW_FACTOR_MINIMUM', factor.key);
      }
    }
  }
  for (const measurement of release.measurements) {
    if (!factorKeys.has(measurement.factorKey)) add('FACTOR_REFERENCE_MISSING', measurement.key);
    if (!validateValueSchema(measurement.valueSchema)) add('VALUE_SCHEMA_INVALID', measurement.key);
    if (!Number.isInteger(measurement.measurementVersion) || measurement.measurementVersion < 1) add('DEFINITION_VERSION_INVALID', measurement.key);
    if (!Number.isFinite(measurement.reliability) || measurement.reliability < 0 || measurement.reliability > 1) add('DEFINITION_VERSION_INVALID', measurement.key);
  }
  for (const instrument of release.instruments) {
    if (!Number.isInteger(instrument.instrumentVersion) || instrument.instrumentVersion < 1) add('DEFINITION_VERSION_INVALID', instrument.key);
    for (const measurementKey of instrument.measurementKeys) {
      if (!measurementKeys.has(measurementKey)) add('MEASUREMENT_REFERENCE_MISSING', instrument.key);
    }
  }
  for (const action of release.actions) {
    if (!Number.isInteger(action.actionVersion) || action.actionVersion < 1) add('DEFINITION_VERSION_INVALID', action.key);
    if (!Number.isInteger(action.publicationVersion) || action.publicationVersion < 1) add('DEFINITION_VERSION_INVALID', action.key);
    if (!Number.isFinite(action.durationMinutes) || action.durationMinutes <= 0) add('DEFINITION_VERSION_INVALID', action.key);
    if (!Number.isFinite(action.cooldownDays) || action.cooldownDays < 0) add('DEFINITION_VERSION_INVALID', action.key);
    for (const factorKey of action.targetFactors) {
      if (!factorKeys.has(factorKey)) add('FACTOR_REFERENCE_MISSING', action.key);
    }
    for (const contraindication of action.contraindications) {
      if (!factorKeys.has(contraindication.factorKey)) add('FACTOR_REFERENCE_MISSING', action.key);
    }
    if (action.minimumSkillFactorKey) {
      const skill = release.factors.find((factor) => factor.key === action.minimumSkillFactorKey);
      if (!skill || skill.type !== 'SKILL') add('ACTION_SKILL_REFERENCE_INVALID', action.key);
    }
  }

  return issues.length === 0
    ? { valid: true }
    : {
        valid: false,
        issues: issues.sort((a, b) =>
          `${a.definitionKey}:${a.reasonCode}`.localeCompare(`${b.definitionKey}:${b.reasonCode}`)
        ),
      };
}

export function createFactorRegistryRelease(
  release: UnhashedFactorRegistryRelease
): FactorRegistryRelease {
  const validation = validateFactorRegistry(release);
  if (!validation.valid) throw new FactorRegistryValidationError(validation.issues);
  return { ...release, hash: hashFactorRegistry(release) };
}

export const verifyFactorRegistryRelease = (
  release: FactorRegistryRelease
): boolean => {
  const validation = validateFactorRegistry(release);
  return validation.valid && hashFactorRegistry(release) === release.hash;
};

export const registryDefinitionCounts = (
  definitions: FactorRegistryDefinitionSet
) => ({
  domains: definitions.domains.length,
  dimensions: definitions.dimensions.length,
  factors: definitions.factors.length,
  measurements: definitions.measurements.length,
  instruments: definitions.instruments.length,
  actions: definitions.actions.length,
});
