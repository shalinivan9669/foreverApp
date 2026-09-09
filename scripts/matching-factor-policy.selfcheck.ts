import assert from "node:assert/strict";
import {
  MVP_FACTOR_REGISTRY,
  MVP_FACTOR_REGISTRY_INPUT,
  MVP_FACTOR_REGISTRY_V6,
} from "@/domain/model/definitions/mvpDefinitions";
import {
  hashFactorRegistry,
  validateFactorRegistry,
  verifyFactorRegistryRelease,
} from "@/domain/model/definitions/registry";
import type { MatchingPolicy } from "@/domain/model/definitions/definitionTypes";

assert.equal(MVP_FACTOR_REGISTRY_V6.registryVersion, 6);
assert.equal(MVP_FACTOR_REGISTRY_V6.algorithmVersion, 4);
assert.ok(verifyFactorRegistryRelease(MVP_FACTOR_REGISTRY_V6));
assert.equal(
  MVP_FACTOR_REGISTRY_V6.hash,
  "3156d7e2e38d9b2e88cc82ca299252974bd746eaa15ccb22af7a47386b23fbbd",
  "the historical v6 canonical identity must not be rewritten",
);
assert.equal(MVP_FACTOR_REGISTRY.registryVersion, 8);
assert.equal(MVP_FACTOR_REGISTRY.algorithmVersion, 5);
assert.equal(MVP_FACTOR_REGISTRY.snapshotVersion, 3);
assert.equal(MVP_FACTOR_REGISTRY.displayVersion, 5);
assert.ok(verifyFactorRegistryRelease(MVP_FACTOR_REGISTRY));
assert.notEqual(MVP_FACTOR_REGISTRY.hash, MVP_FACTOR_REGISTRY_V6.hash);

const enabled = MVP_FACTOR_REGISTRY.factors.filter(
  (factor) => factor.matchingPolicy?.enabled === true,
);
assert.equal(enabled.length, 7);
for (const factor of enabled) {
  const policy = factor.matchingPolicy;
  assert.ok(policy);
  assert.equal(policy.strategy.context, "DATING");
  assert.ok(
    factor.pairStrategies.some(
      (strategy) =>
        strategy.context === policy.strategy.context &&
        strategy.config.type === policy.strategy.type &&
        strategy.strategyVersion === policy.strategy.strategyVersion,
    ),
  );
}

const children = enabled.find(
  (factor) => factor.key === "lifePlans.family.childrenIntent",
);
assert.ok(children?.matchingPolicy?.canBeHardConstraint);
assert.equal(children.matchingPolicy.privacy.explanation, "NONE");
assert.equal(children.matchingPolicy.requiredData, "BOTH_REQUIRED");

const structure = enabled.find(
  (factor) => factor.key === "sharedLife.planning.structurePreference",
);
assert.ok(structure);
assert.equal(structure.matchingPolicy?.canBeHardConstraint, false);

const repairSkill = enabled.find(
  (factor) => factor.key === "communication.conflict.repairSkill",
);
assert.ok(repairSkill);
assert.equal(repairSkill.aggregationStrategy.type, "RECENCY_WEIGHTED");
assert.equal(repairSkill.aggregationStrategy.minimumEvidence, 2);

const changedWeight = {
  ...MVP_FACTOR_REGISTRY_INPUT,
  factors: MVP_FACTOR_REGISTRY_INPUT.factors.map((factor) =>
    factor.key === structure.key && factor.matchingPolicy
      ? {
          ...factor,
          matchingPolicy: {
            ...factor.matchingPolicy,
            rankingWeight: factor.matchingPolicy.rankingWeight - 0.01,
          },
        }
      : factor,
  ),
};
assert.notEqual(
  hashFactorRegistry(changedWeight),
  MVP_FACTOR_REGISTRY.hash,
  "matching policy must participate in canonical hash",
);

const assertPolicyHashChange = (
  label: string,
  transform: (policy: MatchingPolicy) => MatchingPolicy,
): void => {
  const changed = {
    ...MVP_FACTOR_REGISTRY_INPUT,
    factors: MVP_FACTOR_REGISTRY_INPUT.factors.map((factor) =>
      factor.key === structure.key && factor.matchingPolicy
        ? { ...factor, matchingPolicy: transform(factor.matchingPolicy) }
        : factor,
    ),
  };
  assert.notEqual(hashFactorRegistry(changed), MVP_FACTOR_REGISTRY.hash, label);
};

assertPolicyHashChange("enabled is hashed", (policy) => ({
  ...policy,
  enabled: false,
}));
assertPolicyHashChange("effect membership is hashed", (policy) => ({
  ...policy,
  effects: policy.effects.filter((effect) => effect !== "POST_MATCH"),
}));
assertPolicyHashChange("strategy type is hashed", (policy) => ({
  ...policy,
  strategy: { ...policy.strategy, type: "SIMILARITY" },
}));
assertPolicyHashChange("strategy version is hashed", (policy) => ({
  ...policy,
  strategy: {
    ...policy.strategy,
    strategyVersion: policy.strategy.strategyVersion + 1,
  },
}));
assertPolicyHashChange("required-data policy is hashed", (policy) => ({
  ...policy,
  requiredData: "BOTH_REQUIRED",
}));
assertPolicyHashChange("default importance is hashed", (policy) => ({
  ...policy,
  defaultImportance: "LOW",
}));
assertPolicyHashChange("hard-constraint permission is hashed", (policy) => ({
  ...policy,
  canBeHardConstraint: true,
}));
assertPolicyHashChange("explanation privacy is hashed", (policy) => ({
  ...policy,
  privacy: { ...policy.privacy, explanation: "NONE" },
}));

const reorderedEffects = {
  ...MVP_FACTOR_REGISTRY_INPUT,
  factors: MVP_FACTOR_REGISTRY_INPUT.factors.map((factor) =>
    factor.matchingPolicy
      ? {
          ...factor,
          matchingPolicy: {
            ...factor.matchingPolicy,
            effects: [...factor.matchingPolicy.effects].reverse(),
          },
        }
      : factor,
  ),
};
assert.equal(
  hashFactorRegistry(reorderedEffects),
  MVP_FACTOR_REGISTRY.hash,
  "effect order must not change canonical identity",
);

const forbiddenHard = {
  ...MVP_FACTOR_REGISTRY_INPUT,
  factors: MVP_FACTOR_REGISTRY_INPUT.factors.map((factor) =>
    factor.key === structure.key && factor.matchingPolicy
      ? {
          ...factor,
          matchingPolicy: {
            ...factor.matchingPolicy,
            canBeHardConstraint: true,
          },
        }
      : factor,
  ),
};
const forbiddenHardValidation = validateFactorRegistry(forbiddenHard);
assert.equal(forbiddenHardValidation.valid, false);
assert.ok(
  !forbiddenHardValidation.valid &&
    forbiddenHardValidation.issues.some(
      (issue) =>
        issue.definitionKey === structure.key &&
        issue.reasonCode === "MATCHING_POLICY_HARD_CONSTRAINT_INVALID",
    ),
);

const missingStrategy = {
  ...MVP_FACTOR_REGISTRY_INPUT,
  factors: MVP_FACTOR_REGISTRY_INPUT.factors.map((factor) =>
    factor.key === structure.key && factor.matchingPolicy
      ? {
          ...factor,
          matchingPolicy: {
            ...factor.matchingPolicy,
            strategy: {
              ...factor.matchingPolicy.strategy,
              strategyVersion: 999,
            },
          },
        }
      : factor,
  ),
};
const missingStrategyValidation = validateFactorRegistry(missingStrategy);
assert.equal(missingStrategyValidation.valid, false);
assert.ok(
  !missingStrategyValidation.valid &&
    missingStrategyValidation.issues.some(
      (issue) =>
        issue.definitionKey === structure.key &&
        issue.reasonCode === "MATCHING_POLICY_STRATEGY_MISSING",
    ),
);

const privateMatchingFactor = {
  ...MVP_FACTOR_REGISTRY_INPUT,
  factors: MVP_FACTOR_REGISTRY_INPUT.factors.map((factor) =>
    factor.key === structure.key
      ? { ...factor, privacyClass: "PRIVATE" as const }
      : factor,
  ),
};
const privateMatchingValidation = validateFactorRegistry(privateMatchingFactor);
assert.equal(privateMatchingValidation.valid, false);
assert.ok(
  !privateMatchingValidation.valid &&
    privateMatchingValidation.issues.some(
      (issue) =>
        issue.definitionKey === structure.key &&
        issue.reasonCode === "MATCHING_POLICY_INVALID",
    ),
);

console.log(
  JSON.stringify({
    ok: true,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    previousRegistryVersion: MVP_FACTOR_REGISTRY_V6.registryVersion,
    matchingFactors: enabled.length,
  }),
);
