export const FACTOR_TYPES = [
  'TRAIT',
  'STATE',
  'SKILL',
  'PREFERENCE_AXIS',
  'VALUE',
  'NEED',
  'EXPECTATION',
  'ROLE_PREFERENCE',
  'ROLE_CAPABILITY',
  'CONSTRAINT',
  'OUTCOME',
] as const;

export type FactorType = (typeof FACTOR_TYPES)[number];

export type SkillLevel = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

export type ScalarValueSchema = {
  type: 'SCALAR';
  min: number;
  max: number;
};

export type BooleanValueSchema = {
  type: 'BOOLEAN';
};

export type CategoryValueSchema = {
  type: 'CATEGORY';
  allowedValues: readonly string[];
};

export type OrdinalValueSchema = {
  type: 'ORDINAL';
  levels: readonly {
    value: string;
    rank: number;
    label: string;
  }[];
};

export type ConstraintValueSchema = {
  type: 'CONSTRAINT';
  allowedValues: readonly string[];
};

export type RangeValueSchema = {
  type: 'RANGE';
  min: number;
  max: number;
};

export type MasteryValueSchema = {
  type: 'MASTERY';
  basicMaxExclusive: number;
  intermediateMaxExclusive: number;
};

export type SetValueSchema = {
  type: 'SET';
  allowedValues: readonly string[];
  minItems: number;
  maxItems: number;
};

export type TextValueSchema = {
  type: 'TEXT';
  minLength: number;
  maxLength: number;
};

export type ValueSchema =
  | ScalarValueSchema
  | BooleanValueSchema
  | CategoryValueSchema
  | OrdinalValueSchema
  | ConstraintValueSchema
  | RangeValueSchema
  | MasteryValueSchema
  | SetValueSchema
  | TextValueSchema;

export type ScalarFactorValue = { kind: 'SCALAR'; value: number };
export type BooleanFactorValue = { kind: 'BOOLEAN'; value: boolean };
export type CategoryFactorValue = { kind: 'CATEGORY'; value: string };
export type OrdinalFactorValue = {
  kind: 'ORDINAL';
  value: string;
  rank: number;
};
export type ConstraintFactorValue = { kind: 'CONSTRAINT'; value: string };
export type RangeFactorValue = {
  kind: 'RANGE';
  low: number;
  high: number;
};
export type MasteryFactorValue = {
  kind: 'MASTERY';
  score01: number;
  level: SkillLevel;
};
export type SetFactorValue = { kind: 'SET'; values: readonly string[] };
export type TextFactorValue = { kind: 'TEXT'; value: string };

export type MissingFactorValue = {
  kind: 'MISSING';
  reasonCode: 'NOT_PROVIDED' | 'NO_EVIDENCE' | 'EXPIRED';
};

export type InvalidFactorValue = {
  kind: 'INVALID';
  reasonCode:
    | 'TYPE_MISMATCH'
    | 'OUT_OF_RANGE'
    | 'INVALID_RANGE'
    | 'VALUE_NOT_ALLOWED'
    | 'INVALID_ORDINAL_RANK'
    | 'INVALID_CARDINALITY'
    | 'INVALID_SKILL_LEVEL'
    | 'EMPTY_VALUE';
};

export type UnknownFactorValue = {
  kind: 'UNKNOWN';
  reasonCode:
    | 'NOT_ANSWERED'
    | 'DECLINED_TO_ANSWER'
    | 'NOT_APPLICABLE'
    | 'UNRESOLVED';
};

export type InsufficientDataFactorValue = {
  kind: 'INSUFFICIENT_DATA';
  reasonCode:
    | 'TOO_FEW_EVIDENCE'
    | 'LOW_CONFIDENCE'
    | 'INCOMPATIBLE_EVIDENCE';
};

export type AvailableFactorValue =
  | ScalarFactorValue
  | BooleanFactorValue
  | CategoryFactorValue
  | OrdinalFactorValue
  | ConstraintFactorValue
  | RangeFactorValue
  | MasteryFactorValue
  | SetFactorValue
  | TextFactorValue;

export type UnavailableFactorValue =
  | MissingFactorValue
  | InvalidFactorValue
  | UnknownFactorValue
  | InsufficientDataFactorValue;

export type FactorValue = AvailableFactorValue | UnavailableFactorValue;

export type FactorValueKind = FactorValue['kind'];

export type FactorValueValidation =
  | { valid: true; value: FactorValue }
  | { valid: false; value: InvalidFactorValue };

const invalid = (
  reasonCode: InvalidFactorValue['reasonCode']
): FactorValueValidation => ({
  valid: false,
  value: { kind: 'INVALID', reasonCode },
});

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export const isAvailableFactorValue = (
  value: FactorValue
): value is AvailableFactorValue =>
  value.kind !== 'MISSING' &&
  value.kind !== 'INVALID' &&
  value.kind !== 'UNKNOWN' &&
  value.kind !== 'INSUFFICIENT_DATA';

export const skillLevelForScore = (
  score01: number,
  schema: MasteryValueSchema
): SkillLevel => {
  if (score01 < schema.basicMaxExclusive) return 'BASIC';
  if (score01 < schema.intermediateMaxExclusive) return 'INTERMEDIATE';
  return 'ADVANCED';
};

export function validateFactorValue(
  schema: ValueSchema,
  value: FactorValue
): FactorValueValidation {
  if (!isAvailableFactorValue(value)) {
    return value.kind === 'INVALID'
      ? { valid: false, value }
      : { valid: true, value };
  }

  if (schema.type !== value.kind) return invalid('TYPE_MISMATCH');

  switch (schema.type) {
    case 'SCALAR':
      if (
        value.kind !== 'SCALAR' ||
        !isFiniteNumber(value.value) ||
        value.value < schema.min ||
        value.value > schema.max
      ) {
        return invalid('OUT_OF_RANGE');
      }
      return { valid: true, value };
    case 'BOOLEAN':
      return value.kind === 'BOOLEAN'
        ? { valid: true, value }
        : invalid('TYPE_MISMATCH');
    case 'CATEGORY':
      if (
        value.kind !== 'CATEGORY' ||
        !schema.allowedValues.includes(value.value)
      ) {
        return invalid('VALUE_NOT_ALLOWED');
      }
      return { valid: true, value };
    case 'ORDINAL': {
      if (value.kind !== 'ORDINAL') return invalid('TYPE_MISMATCH');
      const level = schema.levels.find(
        (candidate) => candidate.value === value.value
      );
      return level && level.rank === value.rank
        ? { valid: true, value }
        : invalid(level ? 'INVALID_ORDINAL_RANK' : 'VALUE_NOT_ALLOWED');
    }
    case 'CONSTRAINT':
      if (
        value.kind !== 'CONSTRAINT' ||
        !schema.allowedValues.includes(value.value)
      ) {
        return invalid('VALUE_NOT_ALLOWED');
      }
      return { valid: true, value };
    case 'RANGE':
      if (value.kind !== 'RANGE') return invalid('TYPE_MISMATCH');
      if (
        !isFiniteNumber(value.low) ||
        !isFiniteNumber(value.high) ||
        value.low < schema.min ||
        value.high > schema.max
      ) {
        return invalid('OUT_OF_RANGE');
      }
      return value.low <= value.high
        ? { valid: true, value }
        : invalid('INVALID_RANGE');
    case 'MASTERY':
      if (
        value.kind !== 'MASTERY' ||
        !isFiniteNumber(value.score01) ||
        value.score01 < 0 ||
        value.score01 > 1
      ) {
        return invalid('OUT_OF_RANGE');
      }
      return skillLevelForScore(value.score01, schema) === value.level
        ? { valid: true, value }
        : invalid('INVALID_SKILL_LEVEL');
    case 'SET': {
      if (value.kind !== 'SET') return invalid('TYPE_MISMATCH');
      const distinctValues = new Set(value.values);
      if (
        distinctValues.size !== value.values.length ||
        value.values.length < schema.minItems ||
        value.values.length > schema.maxItems
      ) {
        return invalid('INVALID_CARDINALITY');
      }
      return value.values.every((item) => schema.allowedValues.includes(item))
        ? { valid: true, value }
        : invalid('VALUE_NOT_ALLOWED');
    }
    case 'TEXT':
      if (value.kind !== 'TEXT') return invalid('TYPE_MISMATCH');
      return value.value.length >= schema.minLength &&
        value.value.length <= schema.maxLength
        ? { valid: true, value }
        : invalid(value.value.length === 0 ? 'EMPTY_VALUE' : 'OUT_OF_RANGE');
  }
}

export function factorValueCanonicalKey(value: AvailableFactorValue): string {
  switch (value.kind) {
    case 'SCALAR':
      return `scalar:${value.value}`;
    case 'BOOLEAN':
      return `boolean:${value.value ? 'true' : 'false'}`;
    case 'CATEGORY':
      return `category:${value.value}`;
    case 'ORDINAL':
      return `ordinal:${value.rank}:${value.value}`;
    case 'CONSTRAINT':
      return `constraint:${value.value}`;
    case 'RANGE':
      return `range:${value.low}:${value.high}`;
    case 'MASTERY':
      return `mastery:${value.level}:${value.score01}`;
    case 'SET':
      return `set:${[...value.values].sort().join('|')}`;
    case 'TEXT':
      return `text:${value.value}`;
  }
}
