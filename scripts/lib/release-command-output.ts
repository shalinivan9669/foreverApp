export const RELEASE_COMMAND_REASON_CODES = [
  'MONGODB_URI_REQUIRED',
  'MODE_INVALID',
  'BATCH_SIZE_INVALID',
  'APPLY_CONFIRMATION_REQUIRED',
  'JWT_SECRET_INVALID',
  'DATABASE_NOT_CONNECTED',
  'TARGET_URI_INVALID',
  'TARGET_GUARD_FAILED',
  'DATA_INVARIANT_BLOCKED',
  'MIGRATION_DATA_BLOCKED',
  'EXTRA_INDEXES_BLOCKED',
  'MISSING_INDEXES_BLOCKED',
  'INDEX_SHAPE_BLOCKED',
  'INDEX_APPLY_INCOMPLETE',
  'LEGACY_INDEX_REVIEW_REQUIRED',
  'COLLECTION_MISSING',
  'DRY_RUN_COMPLETE',
  'INDEXES_READY',
  'DUPLICATE_ACTIVE_MEMBERSHIP',
  'MALFORMED_PAIRS',
  'DUPLICATE_ACTIVE_INVITES',
  'DUPLICATE_MEMBERSHIP_CLAIMS',
  'DUPLICATE_PAIR_CHECKINS',
  'DUPLICATE_WEEKLY_CYCLES',
  'DUPLICATE_PAIR_SNAPSHOTS',
  'DUPLICATE_LIKE_CREATION_KEYS',
  'DUPLICATE_OFFERED_DECISIONS',
  'DUPLICATE_NOTIFICATION_DEDUPE',
  'DUPLICATE_BILLING_EVENTS',
  'DUPLICATE_PAIR_PROVIDER_SUBSCRIPTIONS',
  'DUPLICATE_CURRENT_PAIR_PROVIDER_SUBSCRIPTIONS',
  'AMBIGUOUS_LEGACY_PAIR_PROVIDER_SUBSCRIPTIONS',
  'DUPLICATE_PENDING_PRIVACY_REQUESTS',
  'LEGACY_PRIVACY_REQUESTS_V1',
  'WEEKLY_STRING_PAIR_IDS',
  'PENDING_WEEKLY_FACTOR_REPLAY',
  'PENDING_ONBOARDING_FACTOR_REPLAY',
  'STALE_MATERIALIZED_FACTOR_MARKERS',
  'CANONICAL_FACTOR_REGISTRY_MISSING_OR_CONFLICTING',
  'LEGACY_ACTIVITY_CONTENT_NOT_PUBLISHABLE',
  'UNPUBLISHED_ACTIVITY_CONTENT',
  'INVALID_PUBLISHED_ACTIVITY_CONTENT',
  'LEGACY_QUESTIONNAIRE_CONTENT_NOT_PUBLISHABLE',
  'UNPUBLISHED_QUESTIONNAIRE_CONTENT',
  'INVALID_PUBLISHED_QUESTIONNAIRE_CONTENT',
  'LEGACY_WEEKLY_USER_WEEK_UNIQUE_INDEX',
  'LEGACY_PAIR_KEY_UNIQUE_INDEX',
  'DUPLICATE_UNIQUE_INDEX',
  'PAIR_ID_INVALID',
  'PAIR_NOT_FOUND',
  'PAIR_MEMBERS_INVALID',
  'USER_NOT_PAIR_MEMBER',
  'PAIR_SCOPE_COLLISION',
  'USER_ID_INVALID',
  'WEEK_KEY_INVALID',
  'RAW_ANSWERS_INVALID',
  'OBSERVED_AT_INVALID',
  'NORMALIZATION_RACE',
  'RUNTIME_REPLAY_FAILED',
  'POLICY_VERSION_INVALID',
  'CONSENT_INVALID',
  'COMPLETED_AT_INVALID',
  'ANSWERS_INVALID',
  'WEEKLY_PAIR_ID_INVALID',
  'WEEKLY_PAIR_NOT_FOUND',
  'WEEKLY_PAIR_MEMBERS_INVALID',
  'WEEKLY_USER_NOT_PAIR_MEMBER',
  'WEEKLY_PAIR_SCOPE_COLLISION',
  'WEEKLY_USER_ID_INVALID',
  'WEEKLY_WEEK_KEY_INVALID',
  'WEEKLY_RAW_ANSWERS_INVALID',
  'WEEKLY_OBSERVED_AT_INVALID',
  'WEEKLY_NORMALIZATION_RACE',
  'WEEKLY_RUNTIME_REPLAY_FAILED',
  'ONBOARDING_USER_ID_INVALID',
  'ONBOARDING_POLICY_VERSION_INVALID',
  'ONBOARDING_CONSENT_INVALID',
  'ONBOARDING_COMPLETED_AT_INVALID',
  'ONBOARDING_ANSWERS_INVALID',
  'ONBOARDING_RUNTIME_REPLAY_FAILED',
  'CURRENT_BINDING',
  'CURRENT_BINDING_WITH_LEGACY_RESIDUE',
  'CUTOVER_MARKER_PRESENT',
  'FUTURE_REGISTRY_VERSION',
  'INVALID_CURRENT_MARKER',
  'INVALID_FACTOR_BINDING',
  'MIXED_FACTOR_BINDING',
  'OTHER_CUTOVER_VERSION',
  'SAFE_SEMANTIC_EVENT_TYPE',
  'UNSUPPORTED_EVENT_TYPE',
  'INVALID_PAIR_ID',
  'INVALID_SOURCE_CHECKIN_ID',
  'INVALID_EXPIRY_DATE',
  'MISSING_EXPIRY_SOURCE_DATE',
  'DUPLICATE_GROUP_WITHOUT_CONFIRMED_SIGNAL',
  'DUPLICATE_GROUP_WITH_INVALID_DATE',
  'UNCLASSIFIED_DATA_REASON',
  'OUTPUT_POLICY_VIOLATION',
  'COMMAND_FAILED',
  'MONGO_COMMAND_FAILED',
] as const;

export type ReleaseCommandReasonCode =
  (typeof RELEASE_COMMAND_REASON_CODES)[number];

export const RELEASE_COMMAND_INDEX_NAMES = [
  'pair_contexts_by_member_key',
  'userId_1_pairId_1_weekKey_1',
  'pairId_1_weekKey_1',
  'userId_1_weekKey_1',
  'one_partner_signal_per_daily_checkin',
  'expiresAt_1',
  'privacy_request_one_confirmable_per_owner_v2',
] as const;

export type ReleaseCommandEvidence = {
  counts: Readonly<Record<string, number>>;
  reasonCounts: Readonly<Partial<Record<ReleaseCommandReasonCode, number>>>;
  indexNames: readonly string[];
};

const RELEASE_COMMAND_REASON_CODE_SET = new Set<string>(
  RELEASE_COMMAND_REASON_CODES
);
const RELEASE_COMMAND_INDEX_NAME_SET = new Set<string>(
  RELEASE_COMMAND_INDEX_NAMES
);
const COUNT_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,79}$/;

export class ReleaseCommandFailure extends Error {
  readonly reasonCode: ReleaseCommandReasonCode;

  constructor(reasonCode: ReleaseCommandReasonCode) {
    super(reasonCode);
    this.name = 'ReleaseCommandFailure';
    this.reasonCode = reasonCode;
  }
}

const sortedNumericRecord = (
  values: Readonly<Record<string, number>>,
  validName: (name: string) => boolean
): Record<string, number> => {
  const entries = Object.entries(values).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (
    entries.some(
      ([name, value]) =>
        !validName(name) ||
        !Number.isFinite(value) ||
        value < 0 ||
        !Number.isSafeInteger(value)
    )
  ) {
    throw new ReleaseCommandFailure('OUTPUT_POLICY_VIOLATION');
  }
  return Object.fromEntries(entries);
};

export const releaseReasonCounts = (
  ...sources: ReadonlyArray<Readonly<Record<string, number>>>
): Partial<Record<ReleaseCommandReasonCode, number>> => {
  const result: Partial<Record<ReleaseCommandReasonCode, number>> = {};
  for (const source of sources) {
    for (const [candidate, count] of Object.entries(source)) {
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new ReleaseCommandFailure('OUTPUT_POLICY_VIOLATION');
      }
      if (count === 0) {
        continue;
      }
      const reasonCode = RELEASE_COMMAND_REASON_CODE_SET.has(candidate)
        ? (candidate as ReleaseCommandReasonCode)
        : 'UNCLASSIFIED_DATA_REASON';
      result[reasonCode] = (result[reasonCode] ?? 0) + count;
    }
  }
  return result;
};

export const serializeReleaseCommandEvidence = (
  evidence: ReleaseCommandEvidence
): string => {
  if (
    evidence.indexNames.some(
      (indexName) => !RELEASE_COMMAND_INDEX_NAME_SET.has(indexName)
    )
  ) {
    throw new ReleaseCommandFailure('OUTPUT_POLICY_VIOLATION');
  }
  return JSON.stringify({
    counts: sortedNumericRecord(evidence.counts, (name) =>
      COUNT_NAME_PATTERN.test(name)
    ),
    reasonCounts: sortedNumericRecord(evidence.reasonCounts, (name) =>
      RELEASE_COMMAND_REASON_CODE_SET.has(name)
    ),
    indexNames: [...new Set(evidence.indexNames)].sort(),
  });
};

export const writeReleaseCommandEvidence = (
  evidence: ReleaseCommandEvidence
): void => {
  console.log(serializeReleaseCommandEvidence(evidence));
};

export const formatReleaseCommandFailure = (
  error: Error
): ReleaseCommandEvidence => ({
  counts: {},
  reasonCounts: {
    [error instanceof ReleaseCommandFailure
      ? error.reasonCode
      : 'COMMAND_FAILED']: 1,
  },
  indexNames: [],
});

export const writeReleaseCommandFailure = (error: Error): void => {
  console.error(serializeReleaseCommandEvidence(formatReleaseCommandFailure(error)));
};
