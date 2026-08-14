import { createHash } from "node:crypto";
import {
  MATCHING_IMPORTANCE_LEVELS,
  type FactorDefinition,
} from "@/domain/model/definitions/definitionTypes";
import { verifyFactorRegistryRelease } from "@/domain/model/definitions/registry";
import type { ValueSchema } from "@/domain/model/values/factorValue";
import {
  MATCHING_CONSTRAINT_MODES,
  MATCHING_FLEXIBILITY_LEVELS,
  type FactorTarget,
  type MatchingPreferenceIssue,
  type PartnerPreference,
  type PartnerPreferenceProfile,
  type ValidatePartnerPreferenceProfileInput,
} from "@/domain/model/matching/intelligence/types";

export class MatchingPreferenceValidationError extends Error {
  readonly issues: readonly MatchingPreferenceIssue[];

  constructor(issues: readonly MatchingPreferenceIssue[]) {
    super(
      `Matching preference validation failed with ${issues.length} issue(s)`,
    );
    this.name = "MatchingPreferenceValidationError";
    this.issues = issues;
  }
}

const hash = (parts: readonly string[]): string =>
  createHash("sha256").update(parts.join("|")).digest("hex");

const finiteRange = (
  minimum: number,
  maximum: number,
  schemaMinimum: number,
  schemaMaximum: number,
): boolean =>
  Number.isFinite(minimum) &&
  Number.isFinite(maximum) &&
  minimum <= maximum &&
  minimum >= schemaMinimum &&
  maximum <= schemaMaximum;

const uniqueNonEmptyStrings = (values: readonly string[]): boolean =>
  values.length > 0 &&
  values.every((value) => value.trim().length > 0) &&
  new Set(values).size === values.length;

const allowedTargetValues = (schema: ValueSchema): readonly string[] => {
  switch (schema.type) {
    case "CATEGORY":
    case "CONSTRAINT":
    case "SET":
      return schema.allowedValues;
    case "ORDINAL":
      return schema.levels.map((level) => level.value);
    case "BOOLEAN":
      return ["true", "false"];
    case "SCALAR":
    case "RANGE":
    case "MASTERY":
    case "TEXT":
      return [];
  }
};

const targetMatchesDefinition = (
  target: FactorTarget,
  definition: FactorDefinition,
): boolean => {
  const schema = definition.valueSchema;
  switch (target.kind) {
    case "SCALAR_RANGE":
      if (schema.type === "SCALAR" || schema.type === "RANGE") {
        return finiteRange(
          target.minimum,
          target.maximum,
          schema.min,
          schema.max,
        );
      }
      if (schema.type === "MASTERY") {
        return finiteRange(target.minimum, target.maximum, 0, 1);
      }
      return false;
    case "CATEGORICAL_SET": {
      const allowed = allowedTargetValues(schema);
      return (
        schema.type !== "CONSTRAINT" &&
        uniqueNonEmptyStrings(target.allowedValues) &&
        target.allowedValues.every((value) => allowed.includes(value))
      );
    }
    case "CONSTRAINT_SET":
      return (
        schema.type === "CONSTRAINT" &&
        uniqueNonEmptyStrings(target.allowedValues) &&
        target.allowedValues.every((value) =>
          schema.allowedValues.includes(value),
        )
      );
    case "ROLE_TARGET":
      return (
        definition.type === "ROLE_PREFERENCE" &&
        schema.type === "SCALAR" &&
        finiteRange(
          target.desiredPreferenceMinimum,
          target.desiredPreferenceMaximum,
          schema.min,
          schema.max,
        )
      );
  }
};

const normalizedTarget = (target: FactorTarget): FactorTarget => {
  switch (target.kind) {
    case "CATEGORICAL_SET":
      return {
        kind: target.kind,
        allowedValues: [...target.allowedValues].sort(),
      };
    case "CONSTRAINT_SET":
      return {
        kind: target.kind,
        allowedValues: [...target.allowedValues].sort(),
      };
    case "SCALAR_RANGE":
      return { ...target };
    case "ROLE_TARGET":
      return { ...target };
  }
};

const encodeTarget = (target: FactorTarget): string => {
  switch (target.kind) {
    case "SCALAR_RANGE":
      return `${target.kind}:${target.minimum}:${target.maximum}`;
    case "CATEGORICAL_SET":
    case "CONSTRAINT_SET":
      return `${target.kind}:${[...target.allowedValues].sort().join(",")}`;
    case "ROLE_TARGET":
      return `${target.kind}:${target.desiredPreferenceMinimum}:${target.desiredPreferenceMaximum}`;
  }
};

export function validatePartnerPreferenceProfile(
  input: ValidatePartnerPreferenceProfileInput,
): PartnerPreferenceProfile {
  const issues: MatchingPreferenceIssue[] = [];
  const add = (
    factorKey: string,
    code: MatchingPreferenceIssue["code"],
  ): void => {
    issues.push({ factorKey, code });
  };
  if (!input.ownerId.trim()) add("$profile", "OWNER_INVALID");
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    add("$profile", "REVISION_INVALID");
  }
  if (!Number.isFinite(input.updatedAt.getTime())) {
    add("$profile", "UPDATED_AT_INVALID");
  }
  if (
    input.release.status !== "PUBLISHED" ||
    !verifyFactorRegistryRelease(input.release)
  ) {
    add("$profile", "REGISTRY_INVALID");
  }
  if (
    input.registryKey !== input.release.registryKey ||
    input.registryVersion !== input.release.registryVersion
  ) {
    add("$profile", "REGISTRY_VERSION_MISMATCH");
  }

  const seen = new Set<string>();
  const preferences: PartnerPreference[] = [];
  for (const preference of input.preferences) {
    if (seen.has(preference.factorKey)) {
      add(preference.factorKey, "FACTOR_DUPLICATE");
      continue;
    }
    seen.add(preference.factorKey);
    const definition = input.release.factors.find(
      (factor) => factor.key === preference.factorKey,
    );
    if (!definition?.matchingPolicy?.enabled) {
      add(preference.factorKey, "FACTOR_NOT_MATCHING_ENABLED");
      continue;
    }
    if (!targetMatchesDefinition(preference.desiredValue, definition)) {
      add(preference.factorKey, "TARGET_INVALID");
    }
    if (
      !MATCHING_IMPORTANCE_LEVELS.some(
        (importance) => importance === preference.importance,
      )
    ) {
      add(preference.factorKey, "IMPORTANCE_INVALID");
    }
    if (
      !MATCHING_FLEXIBILITY_LEVELS.some(
        (flexibility) => flexibility === preference.flexibility,
      )
    ) {
      add(preference.factorKey, "FLEXIBILITY_INVALID");
    }
    if (
      !MATCHING_CONSTRAINT_MODES.some(
        (mode) => mode === preference.constraintMode,
      )
    ) {
      add(preference.factorKey, "CONSTRAINT_MODE_INVALID");
    }
    if (preference.constraintMode === "HARD") {
      if (!definition.matchingPolicy.canBeHardConstraint) {
        add(preference.factorKey, "HARD_CONSTRAINT_NOT_ALLOWED");
      }
      if (preference.flexibility !== "NON_NEGOTIABLE") {
        add(preference.factorKey, "HARD_CONSTRAINT_REQUIRES_NON_NEGOTIABLE");
      }
      if (preference.desiredValue.kind !== "CONSTRAINT_SET") {
        add(preference.factorKey, "TARGET_INVALID");
      }
    }
    preferences.push({
      ...preference,
      desiredValue: normalizedTarget(preference.desiredValue),
    });
  }

  if (issues.length > 0) {
    throw new MatchingPreferenceValidationError(
      issues.sort((left, right) =>
        `${left.factorKey}:${left.code}`.localeCompare(
          `${right.factorKey}:${right.code}`,
        ),
      ),
    );
  }

  const ordered = preferences.sort((left, right) =>
    left.factorKey.localeCompare(right.factorKey),
  );
  const inputHash = hash([
    "MATCHING_PARTNER_PREFERENCES",
    input.ownerId,
    String(input.revision),
    input.release.registryKey,
    String(input.release.registryVersion),
    input.release.hash,
    ...ordered.map(
      (preference) =>
        `${preference.factorKey}:${encodeTarget(preference.desiredValue)}:${preference.importance}:${preference.flexibility}:${preference.constraintMode}`,
    ),
  ]);

  return {
    ownerId: input.ownerId,
    revision: input.revision,
    registryKey: input.release.registryKey,
    registryVersion: input.release.registryVersion,
    registryHash: input.release.hash,
    preferences: ordered,
    inputHash,
    updatedAt: new Date(input.updatedAt.getTime()),
  };
}
