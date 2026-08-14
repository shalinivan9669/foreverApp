import type {
  FactorDefinition,
  FactorRegistryRelease,
} from "@/domain/model/definitions/definitionTypes";

export const matchingEnabledFactorDefinitions = (
  release: FactorRegistryRelease,
): readonly FactorDefinition[] =>
  release.factors
    .filter((factor) => factor.matchingPolicy?.enabled === true)
    .sort((left, right) => left.key.localeCompare(right.key));

export const matchingRequiredFactorKeys = (
  release: FactorRegistryRelease,
): readonly string[] =>
  matchingEnabledFactorDefinitions(release)
    .filter((factor) => factor.matchingPolicy?.requiredData !== "OPTIONAL")
    .map((factor) => factor.key);
