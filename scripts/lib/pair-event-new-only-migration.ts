import mongoose, { Types } from 'mongoose';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';

export const PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION =
  'pair-event-new-only-v1';

export type PairEventNewOnlyMigrationMode = 'DRY_RUN' | 'NEW_ONLY';

type LocalizedText = {
  ru?: string;
  en?: string;
};

type RawPairEventSource = {
  kind?: string;
  refId?: string;
  weekKey?: string;
  cycleKey?: string;
  date?: Date;
};

type RawPairEventActionPolicy = {
  canAccept?: boolean;
  canDecline?: boolean;
  canSnooze?: boolean;
  maxGeneratedActivities?: number;
};

type RawPairEventCutover = {
  version?: string;
  outcome?: string;
};

export type RawPairEventForMigration = {
  _id: Types.ObjectId;
  pairId?: Types.ObjectId;
  key?: string;
  category?: string;
  type?: string;
  title?: LocalizedText;
  description?: LocalizedText;
  why?: LocalizedText;
  eventDate?: Date;
  windowStart?: Date;
  windowEnd?: Date;
  status?: string;
  priority?: number;
  severity?: number;
  axis?: string[];
  factorRegistryVersion?: number;
  targetFactorKeys?: string[];
  source?: RawPairEventSource;
  actionPolicy?: RawPairEventActionPolicy;
  generatedActivityIds?: Types.ObjectId[];
  expiresAt?: Date;
  factorEngineCutover?: RawPairEventCutover;
  diagnostics?: mongoose.mongo.Document;
  weekly?: mongoose.mongo.Document;
  weeklySummary?: mongoose.mongo.Document;
  rawWeekly?: mongoose.mongo.Document;
  fatigue?: number;
  readiness?: number;
  divergence?: mongoose.mongo.Document;
  passport?: mongoose.mongo.Document;
};

export type PairEventMigrationDisposition =
  | 'ALREADY_CANONICAL'
  | 'ALREADY_MIGRATED'
  | 'BIND_SAFE_EVENT'
  | 'SCRUB_CANONICAL_EVENT'
  | 'RETIRE_UNSAFE_EVENT'
  | 'RETIRE_INVALID_EVENT'
  | 'FUTURE_CONFLICT';

export type PairEventMigrationPlan = {
  disposition: PairEventMigrationDisposition;
  reason: string;
  update?: mongoose.mongo.UpdateFilter<RawPairEventForMigration>;
};

export type PairEventNewOnlyMigrationReport = {
  mode: PairEventNewOnlyMigrationMode;
  migrationVersion: typeof PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION;
  registryVersion: number;
  batchSize: number;
  scanned: number;
  alreadyCanonical: number;
  alreadyMigrated: number;
  safeEligible: number;
  canonicalNeedingScrub: number;
  unsafeLegacy: number;
  invalidOrMixed: number;
  futureConflicts: number;
  wouldBind: number;
  wouldScrubCanonical: number;
  wouldRetireUnsafe: number;
  wouldRetireInvalid: number;
  bound: number;
  scrubbedCanonical: number;
  retiredUnsafe: number;
  retiredInvalid: number;
  concurrentSkipped: number;
  evidenceWrites: 0;
  snapshotWrites: 0;
  reasons: Record<string, number>;
};

type RunPairEventNewOnlyMigrationInput = {
  mode?: PairEventNewOnlyMigrationMode;
  batchSize?: number;
  now?: Date;
};

type SafeEventPolicy = {
  category: 'relationship_milestone' | 'calendar_event' | 'behavioral_event';
  allowedSourceKinds: readonly string[];
  canonicalSourceKind:
    | 'pair_lifecycle'
    | 'calendar_rule'
    | 'weekly_pair_state'
    | 'activity_history';
  actionKey: 'action.gentleThreeMinuteCheckIn';
};

const SAFE_EVENT_POLICIES: Readonly<Record<string, SafeEventPolicy>> = {
  first_month: {
    category: 'relationship_milestone',
    allowedSourceKinds: ['pair_created_at', 'pair_lifecycle'],
    canonicalSourceKind: 'pair_lifecycle',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  three_months: {
    category: 'relationship_milestone',
    allowedSourceKinds: ['pair_created_at', 'pair_lifecycle'],
    canonicalSourceKind: 'pair_lifecycle',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  six_months: {
    category: 'relationship_milestone',
    allowedSourceKinds: ['pair_created_at', 'pair_lifecycle'],
    canonicalSourceKind: 'pair_lifecycle',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  anniversary: {
    category: 'relationship_milestone',
    allowedSourceKinds: ['pair_created_at', 'pair_lifecycle'],
    canonicalSourceKind: 'pair_lifecycle',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  valentines_day: {
    category: 'calendar_event',
    allowedSourceKinds: ['calendar_rule'],
    canonicalSourceKind: 'calendar_rule',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  march_8: {
    category: 'calendar_event',
    allowedSourceKinds: ['calendar_rule'],
    canonicalSourceKind: 'calendar_rule',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  new_year: {
    category: 'calendar_event',
    allowedSourceKinds: ['calendar_rule'],
    canonicalSourceKind: 'calendar_rule',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  inactive_pair: {
    category: 'behavioral_event',
    allowedSourceKinds: ['activity_history'],
    canonicalSourceKind: 'activity_history',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  failed_activity_recovery: {
    category: 'behavioral_event',
    allowedSourceKinds: ['activity_history'],
    canonicalSourceKind: 'activity_history',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
  weekly_success_celebration: {
    category: 'behavioral_event',
    allowedSourceKinds: ['weekly_checkin', 'weekly_pair_state'],
    canonicalSourceKind: 'weekly_pair_state',
    actionKey: 'action.gentleThreeMinuteCheckIn',
  },
};

const UNSAFE_LEGACY_TYPES = new Set([
  'diagnostics_risk_focus',
  'high_fatigue_recovery',
  'weekly_divergence_repair',
  'partner_birthday',
]);

const TERMINAL_OR_ACTIVE_STATUSES = new Set([
  'upcoming',
  'offered',
  'accepted',
  'declined',
  'snoozed',
  'expired',
  'completed',
]);

const CUTOVER_OUTCOMES = new Set([
  'BOUND_SAFE_EVENT',
  'SCRUBBED_CANONICAL_EVENT',
  'RETIRED_UNSAFE_EVENT',
  'RETIRED_INVALID_EVENT',
]);

const LEGACY_RAW_FIELDS = [
  'axis',
  'diagnostics',
  'weekly',
  'weeklySummary',
  'rawWeekly',
  'fatigue',
  'readiness',
  'divergence',
  'passport',
] as const;

const RETIRED_TEXT = {
  title: { ru: 'Архивное событие', en: 'Archived event' },
  description: {
    ru: 'Событие закрыто при переходе на новую семантическую модель.',
    en: 'This event was closed during the semantic model cutover.',
  },
  why: {
    ru: 'Оно не используется для рекомендаций или новых действий.',
    en: 'It is not used for recommendations or new activities.',
  },
} as const;

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const validDate = (value: Date | undefined): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

const validBoundedString = (
  value: string | undefined,
  maximum: number,
  allowEmpty = false
): value is string =>
  typeof value === 'string' &&
  value.length <= maximum &&
  (allowEmpty || value.trim().length > 0);

const validLocalizedText = (value: LocalizedText | undefined): boolean =>
  Boolean(
    value &&
      validBoundedString(value.ru, 2_000) &&
      validBoundedString(value.en, 2_000)
  );

const validActionPolicy = (
  value: RawPairEventActionPolicy | undefined
): boolean =>
  Boolean(
    value &&
      typeof value.canAccept === 'boolean' &&
      typeof value.canDecline === 'boolean' &&
      typeof value.canSnooze === 'boolean' &&
      [1, 2, 3].includes(value.maxGeneratedActivities ?? 0)
  );

const validGeneratedActivityIds = (
  value: Types.ObjectId[] | undefined
): boolean =>
  Array.isArray(value) && value.every((item) => item instanceof Types.ObjectId);

const canonicalTargetsForAction = (
  actionKey: SafeEventPolicy['actionKey']
): string[] => {
  if (MVP_FACTOR_REGISTRY.status !== 'PUBLISHED') {
    throw new Error('Pair-event migration requires a published Factor registry');
  }
  const action = MVP_FACTOR_REGISTRY.actions.find(
    (candidate) => candidate.key === actionKey
  );
  if (!action) {
    throw new Error(`Canonical action is missing from Factor registry: ${actionKey}`);
  }
  const targets = [...action.targetFactors];
  if (
    targets.length === 0 ||
    targets.length > 4 ||
    new Set(targets).size !== targets.length
  ) {
    throw new Error(`Canonical action has invalid Factor targets: ${actionKey}`);
  }
  for (const target of targets) {
    const factor = MVP_FACTOR_REGISTRY.factors.find(
      (candidate) => candidate.key === target
    );
    if (
      !factor ||
      !factor.contexts.includes('COMMITTED_RELATIONSHIP') ||
      factor.privacyClass === 'SENSITIVE' ||
      factor.privacyClass === 'MATCHING_ONLY'
    ) {
      throw new Error(`Canonical action has an unsafe Factor target: ${target}`);
    }
  }
  return targets;
};

export const PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS = Object.freeze(
  canonicalTargetsForAction('action.gentleThreeMinuteCheckIn')
);

const sameStringArray = (
  left: readonly string[] | undefined,
  right: readonly string[]
): boolean =>
  Array.isArray(left) &&
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const hasLegacyRawResidue = (row: RawPairEventForMigration): boolean =>
  LEGACY_RAW_FIELDS.some((field) => hasOwn(row, field)) ||
  row.source?.kind === 'pair_created_at' ||
  row.source?.kind === 'weekly_checkin' ||
  Boolean(row.source && hasOwn(row.source, 'weekKey'));

const canonicalSource = (
  row: RawPairEventForMigration,
  policy: SafeEventPolicy
): RawPairEventSource => {
  const source: RawPairEventSource = { kind: policy.canonicalSourceKind };
  if (validDate(row.source?.date)) source.date = row.source.date;

  if (row.type === 'failed_activity_recovery') {
    const refId = row.source?.refId?.trim();
    if (validBoundedString(refId, 128)) source.refId = refId;
  }

  if (policy.canonicalSourceKind === 'weekly_pair_state') {
    const cycleKey = row.source?.cycleKey?.trim() || row.source?.weekKey?.trim();
    if (validBoundedString(cycleKey, 32) && /^[A-Za-z0-9:_-]+$/.test(cycleKey)) {
      source.cycleKey = cycleKey;
    }
  }
  return source;
};

const legacyUnsets = (): Record<string, ''> =>
  Object.fromEntries(LEGACY_RAW_FIELDS.map((field) => [field, ''])) as Record<
    string,
    ''
  >;

const cutoverMarker = (
  outcome: string,
  now: Date
): mongoose.mongo.Document => ({
  version: PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION,
  outcome,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  migratedAt: now,
});

const safeShapeFailure = (
  row: RawPairEventForMigration,
  policy: SafeEventPolicy
): string | undefined => {
  if (!(row.pairId instanceof Types.ObjectId)) return 'INVALID_PAIR_ID';
  if (!validBoundedString(row.key, 256)) return 'INVALID_KEY';
  if (row.category !== policy.category) return 'CATEGORY_TYPE_MISMATCH';
  if (!validLocalizedText(row.title)) return 'INVALID_TITLE';
  if (!validLocalizedText(row.description)) return 'INVALID_DESCRIPTION';
  if (!validLocalizedText(row.why)) return 'INVALID_WHY';
  if (!validDate(row.windowStart) || !validDate(row.windowEnd)) {
    return 'INVALID_WINDOW';
  }
  if (row.windowStart.getTime() > row.windowEnd.getTime()) {
    return 'INVERTED_WINDOW';
  }
  if (hasOwn(row, 'eventDate') && !validDate(row.eventDate)) {
    return 'INVALID_EVENT_DATE';
  }
  if (!TERMINAL_OR_ACTIVE_STATUSES.has(row.status ?? '')) {
    return 'INVALID_STATUS';
  }
  if (![1, 2, 3].includes(row.priority ?? 0)) return 'INVALID_PRIORITY';
  if (hasOwn(row, 'severity') && ![1, 2, 3].includes(row.severity ?? 0)) {
    return 'INVALID_SEVERITY';
  }
  if (!validActionPolicy(row.actionPolicy)) return 'INVALID_ACTION_POLICY';
  if (!validGeneratedActivityIds(row.generatedActivityIds)) {
    return 'INVALID_GENERATED_ACTIVITY_IDS';
  }
  const sourceKind = row.source?.kind;
  if (!sourceKind || !policy.allowedSourceKinds.includes(sourceKind)) {
    return 'SOURCE_TYPE_MISMATCH';
  }
  if (row.source?.date !== undefined && !validDate(row.source.date)) {
    return 'INVALID_SOURCE_DATE';
  }
  return undefined;
};

const bindingState = (
  row: RawPairEventForMigration
): 'MISSING' | 'MIXED' | 'PRESENT' => {
  const hasVersion = hasOwn(row, 'factorRegistryVersion');
  const hasTargets = hasOwn(row, 'targetFactorKeys');
  if (!hasVersion && !hasTargets) return 'MISSING';
  if (hasVersion !== hasTargets) return 'MIXED';
  return 'PRESENT';
};

const baseGuard = (row: RawPairEventForMigration): mongoose.mongo.Document => {
  const guard: mongoose.mongo.Document = {
    _id: row._id,
    'factorEngineCutover.version': {
      $ne: PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION,
    },
  };
  for (const field of ['key', 'type', 'category'] as const) {
    guard[field] = hasOwn(row, field)
      ? row[field]
      : { $exists: false };
  }
  guard.factorRegistryVersion = hasOwn(row, 'factorRegistryVersion')
    ? row.factorRegistryVersion
    : { $exists: false };
  guard.targetFactorKeys = hasOwn(row, 'targetFactorKeys')
    ? row.targetFactorKeys
    : { $exists: false };
  return guard;
};

const safeUpdate = (
  row: RawPairEventForMigration,
  policy: SafeEventPolicy,
  now: Date,
  outcome: 'BOUND_SAFE_EVENT' | 'SCRUBBED_CANONICAL_EVENT'
): mongoose.mongo.UpdateFilter<RawPairEventForMigration> => {
  const set: mongoose.mongo.Document = {
    factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
    source: canonicalSource(row, policy),
    factorEngineCutover: cutoverMarker(outcome, now),
  };
  if (
    row.status !== 'accepted' &&
    row.status !== 'completed' &&
    row.status !== 'declined' &&
    validDate(row.windowEnd) &&
    row.windowEnd.getTime() < now.getTime()
  ) {
    set.status = 'expired';
    set.expiresAt = row.windowEnd;
  }
  return { $set: set, $unset: legacyUnsets() };
};

const retiredUpdate = (
  row: RawPairEventForMigration,
  now: Date,
  outcome: 'RETIRED_UNSAFE_EVENT' | 'RETIRED_INVALID_EVENT'
): mongoose.mongo.UpdateFilter<RawPairEventForMigration> => ({
  $set: {
    key: `retired:${PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION}:${row._id.toHexString()}`,
    category: 'behavioral_event',
    type: 'retired_legacy_signal',
    title: RETIRED_TEXT.title,
    description: RETIRED_TEXT.description,
    why: RETIRED_TEXT.why,
    windowStart: now,
    windowEnd: now,
    status: 'expired',
    priority: 3,
    source: { kind: 'activity_history' },
    actionPolicy: {
      canAccept: false,
      canDecline: false,
      canSnooze: false,
      maxGeneratedActivities: 1,
    },
    generatedActivityIds: [],
    expiresAt: now,
    factorEngineCutover: cutoverMarker(outcome, now),
  },
  $unset: {
    ...legacyUnsets(),
    eventDate: '',
    severity: '',
    factorRegistryVersion: '',
    targetFactorKeys: '',
    acceptedAt: '',
    declinedAt: '',
    snoozedUntil: '',
    completedAt: '',
  },
});

const unsafeReason = (row: RawPairEventForMigration): string | undefined => {
  if (UNSAFE_LEGACY_TYPES.has(row.type ?? '')) {
    return `UNSAFE_TYPE_${row.type}`;
  }
  if (row.source?.kind === 'diagnostics') return 'UNSAFE_DIAGNOSTICS_SOURCE';
  const key = row.key?.toLowerCase() ?? '';
  if (
    key.includes('diagnostics') ||
    key.includes('high_fatigue') ||
    key.includes('weekly_divergence')
  ) {
    return 'UNSAFE_LEGACY_KEY';
  }
  return undefined;
};

export const planPairEventNewOnlyMigration = (
  row: RawPairEventForMigration,
  now: Date
): PairEventMigrationPlan => {
  if (!validDate(now)) throw new Error('Migration now must be a valid date');
  const existingCutover = row.factorEngineCutover;
  if (existingCutover?.version === PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION) {
    return CUTOVER_OUTCOMES.has(existingCutover.outcome ?? '')
      ? { disposition: 'ALREADY_MIGRATED', reason: 'CUTOVER_MARKER_PRESENT' }
      : { disposition: 'FUTURE_CONFLICT', reason: 'INVALID_CURRENT_MARKER' };
  }
  if (existingCutover?.version) {
    return { disposition: 'FUTURE_CONFLICT', reason: 'OTHER_CUTOVER_VERSION' };
  }

  const unsafe = unsafeReason(row);
  if (unsafe) {
    return {
      disposition: 'RETIRE_UNSAFE_EVENT',
      reason: unsafe,
      update: retiredUpdate(row, now, 'RETIRED_UNSAFE_EVENT'),
    };
  }

  const policy = SAFE_EVENT_POLICIES[row.type ?? ''];
  if (!policy) {
    return {
      disposition: 'RETIRE_INVALID_EVENT',
      reason: 'UNSUPPORTED_EVENT_TYPE',
      update: retiredUpdate(row, now, 'RETIRED_INVALID_EVENT'),
    };
  }

  const invalidShape = safeShapeFailure(row, policy);
  if (invalidShape) {
    return {
      disposition: 'RETIRE_INVALID_EVENT',
      reason: invalidShape,
      update: retiredUpdate(row, now, 'RETIRED_INVALID_EVENT'),
    };
  }

  const bindings = bindingState(row);
  if (bindings === 'MIXED') {
    return {
      disposition: 'RETIRE_INVALID_EVENT',
      reason: 'MIXED_FACTOR_BINDING',
      update: retiredUpdate(row, now, 'RETIRED_INVALID_EVENT'),
    };
  }
  if (bindings === 'PRESENT') {
    if (
      Number.isInteger(row.factorRegistryVersion) &&
      (row.factorRegistryVersion ?? 0) > MVP_FACTOR_REGISTRY.registryVersion
    ) {
      return { disposition: 'FUTURE_CONFLICT', reason: 'FUTURE_REGISTRY_VERSION' };
    }
    const canonical =
      row.factorRegistryVersion === MVP_FACTOR_REGISTRY.registryVersion &&
      sameStringArray(
        row.targetFactorKeys,
        PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS
      );
    if (!canonical) {
      return {
        disposition: 'RETIRE_INVALID_EVENT',
        reason: 'INVALID_FACTOR_BINDING',
        update: retiredUpdate(row, now, 'RETIRED_INVALID_EVENT'),
      };
    }
    if (!hasLegacyRawResidue(row)) {
      return { disposition: 'ALREADY_CANONICAL', reason: 'CURRENT_BINDING' };
    }
    return {
      disposition: 'SCRUB_CANONICAL_EVENT',
      reason: 'CURRENT_BINDING_WITH_LEGACY_RESIDUE',
      update: safeUpdate(row, policy, now, 'SCRUBBED_CANONICAL_EVENT'),
    };
  }

  return {
    disposition: 'BIND_SAFE_EVENT',
    reason: 'SAFE_SEMANTIC_EVENT_TYPE',
    update: safeUpdate(row, policy, now, 'BOUND_SAFE_EVENT'),
  };
};

const assertBatchSize = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error('batchSize must be an integer between 1 and 500');
  }
  return value;
};

const emptyReport = (
  mode: PairEventNewOnlyMigrationMode,
  batchSize: number
): PairEventNewOnlyMigrationReport => ({
  mode,
  migrationVersion: PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION,
  registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
  batchSize,
  scanned: 0,
  alreadyCanonical: 0,
  alreadyMigrated: 0,
  safeEligible: 0,
  canonicalNeedingScrub: 0,
  unsafeLegacy: 0,
  invalidOrMixed: 0,
  futureConflicts: 0,
  wouldBind: 0,
  wouldScrubCanonical: 0,
  wouldRetireUnsafe: 0,
  wouldRetireInvalid: 0,
  bound: 0,
  scrubbedCanonical: 0,
  retiredUnsafe: 0,
  retiredInvalid: 0,
  concurrentSkipped: 0,
  evidenceWrites: 0,
  snapshotWrites: 0,
  reasons: {},
});

const countPlan = (
  report: PairEventNewOnlyMigrationReport,
  plan: PairEventMigrationPlan
): void => {
  report.scanned += 1;
  report.reasons[plan.reason] = (report.reasons[plan.reason] ?? 0) + 1;
  switch (plan.disposition) {
    case 'ALREADY_CANONICAL':
      report.alreadyCanonical += 1;
      return;
    case 'ALREADY_MIGRATED':
      report.alreadyMigrated += 1;
      return;
    case 'BIND_SAFE_EVENT':
      report.safeEligible += 1;
      report.wouldBind += 1;
      return;
    case 'SCRUB_CANONICAL_EVENT':
      report.canonicalNeedingScrub += 1;
      report.wouldScrubCanonical += 1;
      return;
    case 'RETIRE_UNSAFE_EVENT':
      report.unsafeLegacy += 1;
      report.wouldRetireUnsafe += 1;
      return;
    case 'RETIRE_INVALID_EVENT':
      report.invalidOrMixed += 1;
      report.wouldRetireInvalid += 1;
      return;
    case 'FUTURE_CONFLICT':
      report.futureConflicts += 1;
  }
};

const scanRows = async (
  collection: mongoose.mongo.Collection<RawPairEventForMigration>,
  batchSize: number,
  visit: (row: RawPairEventForMigration) => Promise<void>
): Promise<void> => {
  let afterId: Types.ObjectId | undefined;
  while (true) {
    const rows = await collection
      .find(afterId ? { _id: { $gt: afterId } } : {})
      .sort({ _id: 1 })
      .limit(batchSize)
      .toArray();
    if (rows.length === 0) return;
    afterId = rows[rows.length - 1]?._id;
    for (const row of rows) await visit(row);
  }
};

export async function runPairEventNewOnlyMigration(
  input: RunPairEventNewOnlyMigrationInput = {}
): Promise<PairEventNewOnlyMigrationReport> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new Error('DATABASE_NOT_CONNECTED');
  }
  const mode = input.mode ?? 'DRY_RUN';
  if (mode !== 'DRY_RUN' && mode !== 'NEW_ONLY') {
    throw new Error('Unsupported pair-event migration mode');
  }
  const batchSize = assertBatchSize(input.batchSize ?? 100);
  const now = input.now ?? new Date();
  if (!validDate(now)) throw new Error('Migration now must be a valid date');
  const collection =
    mongoose.connection.db.collection<RawPairEventForMigration>('pair_events');
  const report = emptyReport(mode, batchSize);

  await scanRows(collection, batchSize, async (row) => {
    countPlan(report, planPairEventNewOnlyMigration(row, now));
  });

  if (mode === 'DRY_RUN') return report;
  if (report.futureConflicts > 0) {
    throw new Error(
      `Pair-event NEW_ONLY migration refused ${report.futureConflicts} future-version conflict(s)`
    );
  }

  await scanRows(collection, batchSize, async (row) => {
    const plan = planPairEventNewOnlyMigration(row, now);
    if (!plan.update) return;
    const result = await collection.updateOne(baseGuard(row), plan.update);
    if (result.modifiedCount !== 1) {
      report.concurrentSkipped += 1;
      return;
    }
    switch (plan.disposition) {
      case 'BIND_SAFE_EVENT':
        report.bound += 1;
        return;
      case 'SCRUB_CANONICAL_EVENT':
        report.scrubbedCanonical += 1;
        return;
      case 'RETIRE_UNSAFE_EVENT':
        report.retiredUnsafe += 1;
        return;
      case 'RETIRE_INVALID_EVENT':
        report.retiredInvalid += 1;
        return;
      default:
        return;
    }
  });

  return report;
}
