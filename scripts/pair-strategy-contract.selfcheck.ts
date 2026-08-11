import assert from 'node:assert/strict';
import {
  MVP_FACTOR_REGISTRY,
  MVP_FACTOR_REGISTRY_INPUT,
  evaluatePairStrategy,
  hashFactorRegistry,
  validateFactorRegistry,
  validatePairStrategyDefinition,
  type PairStrategyConfig,
  type PairStrategyDefinition,
  type RelationshipContext,
  type UnhashedFactorRegistryRelease,
} from '@/domain/model';

const strategy = (
  config: PairStrategyConfig,
  context: RelationshipContext = 'COMMITTED_RELATIONSHIP'
): PairStrategyDefinition => ({
  strategyVersion: 2,
  directionality:
    config.type === 'DIRECTIONAL_EXPECTATION' ? 'DIRECTIONAL' : 'SYMMETRIC',
  context,
  config,
  minimumConfidence: 0.35,
  actionability: 'NEGOTIATION',
});

const strategyConfigs: readonly PairStrategyConfig[] = [
  { type: 'SIMILARITY', maximumDistance: 1 },
  { type: 'BOUNDED_GAP', comfortableGap: 0.2, maximumGap: 0.8 },
  { type: 'TARGET_RANGE', targetMin: 0.1, targetMax: 0.9 },
  { type: 'COMPLEMENT', idealGap: 0.6, tolerance: 0.5 },
  {
    type: 'BOUNDED_COMPLEMENT',
    minimumUsefulGap: 0.2,
    idealGap: 0.6,
    maximumGap: 0.95,
  },
  { type: 'MINIMUM_BOTH', minimum: 0.2 },
  {
    type: 'ROLE_COVERAGE',
    minimumCoverage: 0.6,
    maximumLoadImbalance: 0.25,
  },
  { type: 'DIRECTIONAL_EXPECTATION', maximumDistanceFromRange: 0.5 },
  {
    type: 'CUSTOM_MATRIX',
    entries: [
      { a: 'category:X', b: 'category:Y', fit: 0.8, status: 'COMPLEMENTARY' },
      { a: 'category:Y', b: 'category:X', fit: 0.8, status: 'COMPLEMENTARY' },
    ],
  },
  {
    type: 'HARD_CONSTRAINT',
    allowedPairs: [
      { a: 'constraint:X', b: 'constraint:X' },
      { a: 'constraint:Y', b: 'constraint:Y' },
    ],
  },
];

for (const config of strategyConfigs) {
  assert.deepEqual(validatePairStrategyDefinition(strategy(config)), {
    valid: true,
  });
}

const symmetricDefinition = strategy({
  type: 'SIMILARITY',
  maximumDistance: 1,
});
assert.deepEqual(
  validatePairStrategyDefinition({
    ...symmetricDefinition,
    strategyVersion: 0,
  }),
  { valid: false, reasonCodes: ['STRATEGY_VERSION_INVALID'] }
);
assert.deepEqual(
  validatePairStrategyDefinition({
    ...symmetricDefinition,
    directionality: 'DIRECTIONAL',
  }),
  { valid: false, reasonCodes: ['STRATEGY_DIRECTIONALITY_MISMATCH'] }
);

const directionalDefinition = strategy({
  type: 'DIRECTIONAL_EXPECTATION',
  maximumDistanceFromRange: 0.5,
});

const nonFiniteConfigs: readonly PairStrategyConfig[] = [
  { type: 'SIMILARITY', maximumDistance: Number.POSITIVE_INFINITY },
  {
    type: 'BOUNDED_GAP',
    comfortableGap: Number.NaN,
    maximumGap: 0.8,
  },
  { type: 'TARGET_RANGE', targetMin: Number.NaN, targetMax: 0.9 },
  {
    type: 'COMPLEMENT',
    idealGap: 0.6,
    tolerance: Number.POSITIVE_INFINITY,
  },
  {
    type: 'BOUNDED_COMPLEMENT',
    minimumUsefulGap: 0.2,
    idealGap: 0.6,
    maximumGap: Number.POSITIVE_INFINITY,
  },
  { type: 'MINIMUM_BOTH', minimum: Number.NaN },
  {
    type: 'ROLE_COVERAGE',
    minimumCoverage: 0.6,
    maximumLoadImbalance: Number.POSITIVE_INFINITY,
  },
  {
    type: 'DIRECTIONAL_EXPECTATION',
    maximumDistanceFromRange: Number.POSITIVE_INFINITY,
  },
];
for (const config of nonFiniteConfigs) {
  assert.equal(
    validatePairStrategyDefinition(strategy(config)).valid,
    false,
    `${config.type} accepted a non-finite configuration`
  );
}

const validScalarA = {
  value: { kind: 'SCALAR', value: 0.2 } as const,
  confidence: 0.9,
};
const validScalarB = {
  value: { kind: 'SCALAR', value: 0.7 } as const,
  confidence: 0.9,
};
const invalidConfidence = evaluatePairStrategy(
  symmetricDefinition,
  { ...validScalarA, confidence: Number.NaN },
  validScalarB,
  { relationshipContext: 'COMMITTED_RELATIONSHIP' }
);
assert.equal(invalidConfidence.status, 'INSUFFICIENT_DATA');
assert.deepEqual(invalidConfidence.reasonCodes, ['INPUT_INVALID']);

const invalidDirectionalContext = evaluatePairStrategy(
  directionalDefinition,
  validScalarA,
  validScalarB,
  {
    relationshipContext: 'COMMITTED_RELATIONSHIP',
    directional: {
      desiredByA: { minimum: Number.NaN, maximum: 1 },
      desiredByB: { minimum: 0, maximum: 1 },
    },
  }
);
assert.equal(invalidDirectionalContext.status, 'INSUFFICIENT_DATA');
assert.deepEqual(invalidDirectionalContext.reasonCodes, [
  'DIRECTIONAL_CONTEXT_INVALID',
]);

const invalidRoleContext = evaluatePairStrategy(
  strategy({
    type: 'ROLE_COVERAGE',
    minimumCoverage: 0.6,
    maximumLoadImbalance: 0.25,
  }),
  validScalarA,
  validScalarB,
  {
    relationshipContext: 'COMMITTED_RELATIONSHIP',
    roleCoverage: {
      partnerA: [
        {
          roleKey: 'planning',
          preference01: 0.5,
          capability01: 0.8,
          load01: Number.POSITIVE_INFINITY,
        },
      ],
      partnerB: [
        {
          roleKey: 'planning',
          preference01: 0.6,
          capability01: 0.7,
          load01: 0.4,
        },
      ],
      fairnessConfidence: 0.9,
    },
  }
);
assert.equal(invalidRoleContext.status, 'INSUFFICIENT_DATA');
assert.deepEqual(invalidRoleContext.reasonCodes, ['ROLE_CONTEXT_INVALID']);

assert.equal(directionalDefinition.directionality, 'DIRECTIONAL');
assert.deepEqual(
  validatePairStrategyDefinition({
    ...directionalDefinition,
    directionality: 'SYMMETRIC',
  }),
  { valid: false, reasonCodes: ['STRATEGY_DIRECTIONALITY_MISMATCH'] }
);

const contextMismatch = evaluatePairStrategy(
  symmetricDefinition,
  { value: { kind: 'SCALAR', value: 0.2 }, confidence: 0.9 },
  { value: { kind: 'SCALAR', value: 0.3 }, confidence: 0.9 },
  { relationshipContext: 'DATING' }
);
assert.equal(contextMismatch.status, 'INSUFFICIENT_DATA');
assert.deepEqual(contextMismatch.reasonCodes, [
  'RELATIONSHIP_CONTEXT_MISMATCH',
]);
assert.equal(contextMismatch.actionability, 'NONE');

const constraintInputs = [
  { value: { kind: 'CONSTRAINT', value: 'X' } as const, confidence: 0.9 },
  { value: { kind: 'CONSTRAINT', value: 'Y' } as const, confidence: 0.9 },
] as const;
const hardConstraintConfig: PairStrategyConfig = {
  type: 'HARD_CONSTRAINT',
  allowedPairs: [
    { a: 'constraint:X', b: 'constraint:X' },
    { a: 'constraint:Y', b: 'constraint:Y' },
  ],
};

const datingConflict = evaluatePairStrategy(
  {
    ...strategy(hardConstraintConfig, 'DATING'),
    actionability: 'DECISION_REQUIRED',
  },
  constraintInputs[0],
  constraintInputs[1],
  { relationshipContext: 'DATING' }
);
assert.equal(datingConflict.status, 'CONSTRAINT_CONFLICT');
assert.deepEqual(datingConflict.reasonCodes, ['HARD_CONSTRAINT_CONFLICT']);
assert.equal(datingConflict.actionability, 'DECISION_REQUIRED');

for (const relationshipContext of [
  'EARLY_RELATIONSHIP',
  'COMMITTED_RELATIONSHIP',
] as const) {
  const discussion = evaluatePairStrategy(
    {
      ...strategy(hardConstraintConfig, relationshipContext),
      actionability: 'DECISION_REQUIRED',
    },
    constraintInputs[0],
    constraintInputs[1],
    { relationshipContext }
  );
  assert.equal(discussion.status, 'REQUIRES_DISCUSSION');
  assert.deepEqual(discussion.reasonCodes, [
    'HARD_CONSTRAINT_REQUIRES_DISCUSSION',
  ]);
  assert.equal(discussion.actionability, 'NEGOTIATION');
}

const firstFactor = MVP_FACTOR_REGISTRY_INPUT.factors[0];
const firstStrategy = firstFactor?.pairStrategies[0];
assert.ok(firstFactor && firstStrategy);

const registryWithFirstStrategy = (
  replacement: PairStrategyDefinition
): UnhashedFactorRegistryRelease => ({
  ...MVP_FACTOR_REGISTRY_INPUT,
  factors: MVP_FACTOR_REGISTRY_INPUT.factors.map((factor, factorIndex) =>
    factorIndex === 0
      ? {
          ...factor,
          pairStrategies: factor.pairStrategies.map((item, strategyIndex) =>
            strategyIndex === 0 ? replacement : item
          ),
        }
      : factor
  ),
});

assert.notEqual(
  hashFactorRegistry(
    registryWithFirstStrategy({
      ...firstStrategy,
      strategyVersion: firstStrategy.strategyVersion + 1,
    })
  ),
  MVP_FACTOR_REGISTRY.hash
);
assert.notEqual(
  hashFactorRegistry(
    registryWithFirstStrategy({
      ...firstStrategy,
      directionality: 'DIRECTIONAL',
    })
  ),
  MVP_FACTOR_REGISTRY.hash
);

const lowConfidenceRegistry = registryWithFirstStrategy({
  ...firstStrategy,
  minimumConfidence:
    firstFactor.confidenceRequirements.minimumPairConfidence - 0.01,
});
const lowConfidenceValidation = validateFactorRegistry(lowConfidenceRegistry);
assert.equal(lowConfidenceValidation.valid, false);
if (!lowConfidenceValidation.valid) {
  assert.ok(
    lowConfidenceValidation.issues.some(
      (issue) =>
        issue.definitionKey === firstFactor.key &&
        issue.reasonCode ===
          'PAIR_STRATEGY_CONFIDENCE_BELOW_FACTOR_MINIMUM'
    )
  );
}

for (const factor of MVP_FACTOR_REGISTRY.factors) {
  for (const definition of factor.pairStrategies) {
    assert.equal(definition.strategyVersion, 2);
    assert.equal(
      definition.directionality,
      definition.config.type === 'DIRECTIONAL_EXPECTATION'
        ? 'DIRECTIONAL'
        : 'SYMMETRIC'
    );
  }
}

console.log(
  JSON.stringify({
    ok: true,
    strategiesValidated: strategyConfigs.length,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    snapshotVersion: MVP_FACTOR_REGISTRY.snapshotVersion,
    displayVersion: MVP_FACTOR_REGISTRY.displayVersion,
  })
);
