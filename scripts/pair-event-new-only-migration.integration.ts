import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS,
  PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION,
  runPairEventNewOnlyMigration,
} from './lib/pair-event-new-only-migration';

const baseMongoUri =
  process.env.PAIR_EVENT_MIGRATION_TEST_MONGODB_URI?.trim() ||
  process.env.MONGODB_URI?.trim() ||
  'mongodb://127.0.0.1:27018/foreverapp_pair_event_migration_test?directConnection=true';
const parsedUri = new URL(baseMongoUri);
const allowedLocalHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const configuredDatabase = decodeURIComponent(parsedUri.pathname.replace(/^\//, ''));
if (
  parsedUri.protocol !== 'mongodb:' ||
  !allowedLocalHosts.has(parsedUri.hostname) ||
  !configuredDatabase.endsWith('_test') ||
  parsedUri.searchParams.get('directConnection') !== 'true'
) {
  throw new Error(
    'Pair-event migration integration requires a local direct Mongo URI and a database ending in _test'
  );
}

const runId = randomUUID().replaceAll('-', '');
const isolatedDatabase = `fa_pair_event_${runId}_test`;
parsedUri.pathname = `/${isolatedDatabase}`;
const mongodbUri = parsedUri.toString();
process.env.MONGODB_URI = mongodbUri;

const now = new Date('2026-08-11T10:00:00.000Z');
const pairId = new Types.ObjectId();

const ids = {
  canonicalClean: new Types.ObjectId(),
  safeMilestone: new Types.ObjectId(),
  safeWeekly: new Types.ObjectId(),
  unsafeFatigue: new Types.ObjectId(),
  unsafeDivergence: new Types.ObjectId(),
  unsafeDiagnostics: new Types.ObjectId(),
  unsafeBirthday: new Types.ObjectId(),
  mixedBinding: new Types.ObjectId(),
  invalidShape: new Types.ObjectId(),
  canonicalResidue: new Types.ObjectId(),
  alreadyMigrated: new Types.ObjectId(),
};

const text = (suffix: string) => ({
  title: { ru: `Событие ${suffix}`, en: `Event ${suffix}` },
  description: { ru: 'Нейтральное описание', en: 'Neutral description' },
  why: { ru: 'Нейтральная причина', en: 'Neutral reason' },
});

const fixture = (
  id: Types.ObjectId,
  suffix: string,
  overrides: mongoose.mongo.Document = {}
): mongoose.mongo.Document => ({
  _id: id,
  pairId,
  key: `${pairId.toHexString()}:${suffix}`,
  category: 'relationship_milestone',
  type: 'first_month',
  ...text(suffix),
  windowStart: new Date('2026-08-10T00:00:00.000Z'),
  windowEnd: new Date('2026-08-20T00:00:00.000Z'),
  status: 'offered',
  priority: 2,
  axis: ['communication'],
  source: {
    kind: 'pair_created_at',
    date: new Date('2026-07-11T00:00:00.000Z'),
  },
  actionPolicy: {
    canAccept: true,
    canDecline: true,
    canSnooze: true,
    maxGeneratedActivities: 2,
  },
  generatedActivityIds: [],
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const main = async (): Promise<void> => {
  await mongoose.connect(mongodbUri, {
    autoIndex: false,
    directConnection: true,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });
  const database = mongoose.connection.db;
  if (!database) throw new Error('DATABASE_NOT_CONNECTED');

  try {
    const pairEvents = database.collection('pair_events');
    const canonicalClean = fixture(ids.canonicalClean, 'canonical-clean', {
      source: { kind: 'pair_lifecycle' },
      factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
    });
    delete canonicalClean.axis;
    const alreadyMigrated = fixture(ids.alreadyMigrated, 'already-migrated', {
      category: 'behavioral_event',
      type: 'retired_legacy_signal',
      status: 'expired',
      source: { kind: 'activity_history' },
      factorEngineCutover: {
        version: PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION,
        outcome: 'RETIRED_UNSAFE_EVENT',
        registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        migratedAt: now,
      },
    });
    delete alreadyMigrated.axis;
    await pairEvents.insertMany([
      canonicalClean,
      fixture(ids.safeMilestone, 'safe-milestone'),
      fixture(ids.safeWeekly, 'safe-weekly', {
        category: 'behavioral_event',
        type: 'weekly_success_celebration',
        status: 'completed',
        source: {
          kind: 'weekly_checkin',
          weekKey: '2026-W32',
          refId: 'raw-weekly-row-id',
        },
        weekly: { fatigue: 0.2, readiness: 0.8, rawAnswers: [1, 2, 3] },
      }),
      fixture(ids.unsafeFatigue, 'high-fatigue', {
        category: 'behavioral_event',
        type: 'high_fatigue_recovery',
        source: { kind: 'weekly_checkin', weekKey: '2026-W32' },
        fatigue: 0.91,
      }),
      fixture(ids.unsafeDivergence, 'weekly-divergence', {
        category: 'behavioral_event',
        type: 'weekly_divergence_repair',
        source: { kind: 'weekly_checkin', weekKey: '2026-W32' },
        divergence: { communication: 0.82 },
      }),
      fixture(ids.unsafeDiagnostics, 'diagnostics', {
        category: 'system_signal',
        type: 'diagnostics_risk_focus',
        source: {
          kind: 'diagnostics',
          refId: 'communication',
          weekKey: '2026-W32',
        },
        diagnostics: { riskZones: [{ axis: 'communication', severity: 3 }] },
        factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
      }),
      fixture(ids.unsafeBirthday, 'partner-birthday', {
        category: 'calendar_event',
        type: 'partner_birthday',
        source: { kind: 'calendar_rule', date: now },
      }),
      fixture(ids.mixedBinding, 'mixed-binding', {
        factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      }),
      fixture(ids.invalidShape, 'invalid-shape', {
        source: { kind: 'manual', refId: 'legacy-manual' },
      }),
      fixture(ids.canonicalResidue, 'canonical-residue', {
        source: {
          kind: 'pair_created_at',
          weekKey: 'legacy-week',
          refId: 'legacy-ref',
        },
        rawWeekly: { answers: ['private'] },
        factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion,
        targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
      }),
      alreadyMigrated,
    ]);

    const sentinel = { _id: new Types.ObjectId(), runId, untouched: true };
    for (const collectionName of [
      'factor_evidence_events',
      'individual_factor_snapshots',
      'pair_factor_evaluation_snapshots',
      'migration_scope_sentinel',
    ]) {
      await database.collection(collectionName).insertOne({ ...sentinel, _id: new Types.ObjectId() });
    }

    const beforeDryRun = await pairEvents.find({}).sort({ _id: 1 }).toArray();
    const dryRun = await runPairEventNewOnlyMigration({
      mode: 'DRY_RUN',
      batchSize: 2,
      now,
    });
    assert.equal(dryRun.scanned, 11);
    assert.equal(dryRun.alreadyCanonical, 1);
    assert.equal(dryRun.alreadyMigrated, 1);
    assert.equal(dryRun.wouldBind, 2);
    assert.equal(dryRun.wouldScrubCanonical, 1);
    assert.equal(dryRun.wouldRetireUnsafe, 4);
    assert.equal(dryRun.wouldRetireInvalid, 2);
    assert.equal(dryRun.futureConflicts, 0);
    assert.equal(dryRun.evidenceWrites, 0);
    assert.equal(dryRun.snapshotWrites, 0);
    assert.deepEqual(
      await pairEvents.find({}).sort({ _id: 1 }).toArray(),
      beforeDryRun,
      'dry-run must not mutate pair events'
    );

    const applied = await runPairEventNewOnlyMigration({
      mode: 'NEW_ONLY',
      batchSize: 3,
      now,
    });
    assert.equal(applied.bound, 2);
    assert.equal(applied.scrubbedCanonical, 1);
    assert.equal(applied.retiredUnsafe, 4);
    assert.equal(applied.retiredInvalid, 2);
    assert.equal(applied.concurrentSkipped, 0);

    const safeMilestone = await pairEvents.findOne({ _id: ids.safeMilestone });
    assert.equal(
      safeMilestone?.factorRegistryVersion,
      MVP_FACTOR_REGISTRY.registryVersion
    );
    assert.deepEqual(
      safeMilestone?.targetFactorKeys,
      PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS
    );
    assert.equal(safeMilestone?.source?.kind, 'pair_lifecycle');
    assert.equal('axis' in (safeMilestone ?? {}), false);

    const safeWeekly = await pairEvents.findOne({ _id: ids.safeWeekly });
    assert.equal(safeWeekly?.status, 'completed');
    assert.equal(safeWeekly?.source?.kind, 'weekly_pair_state');
    assert.equal(safeWeekly?.source?.cycleKey, '2026-W32');
    assert.equal('weekKey' in (safeWeekly?.source ?? {}), false);
    assert.equal('refId' in (safeWeekly?.source ?? {}), false);
    assert.equal('weekly' in (safeWeekly ?? {}), false);
    assert.equal('axis' in (safeWeekly ?? {}), false);

    for (const retiredId of [
      ids.unsafeFatigue,
      ids.unsafeDivergence,
      ids.unsafeDiagnostics,
      ids.unsafeBirthday,
      ids.mixedBinding,
      ids.invalidShape,
    ]) {
      const retired = await pairEvents.findOne({ _id: retiredId });
      assert.ok(retired);
      assert.equal(retired.type, 'retired_legacy_signal');
      assert.equal(retired.status, 'expired');
      assert.equal(retired.actionPolicy?.canAccept, false);
      assert.deepEqual(retired.generatedActivityIds, []);
      assert.equal('factorRegistryVersion' in retired, false);
      assert.equal('targetFactorKeys' in retired, false);
      assert.equal('axis' in retired, false);
      assert.equal('diagnostics' in retired, false);
      assert.equal('weekly' in retired, false);
      assert.equal('fatigue' in retired, false);
      assert.equal('divergence' in retired, false);
      assert.ok(String(retired.key).startsWith('retired:pair-event-new-only-v1:'));
      assert.equal(retired.factorEngineCutover?.version, PAIR_EVENT_NEW_ONLY_MIGRATION_VERSION);
    }

    const canonicalResidue = await pairEvents.findOne({
      _id: ids.canonicalResidue,
    });
    assert.equal(canonicalResidue?.source?.kind, 'pair_lifecycle');
    assert.equal('axis' in (canonicalResidue ?? {}), false);
    assert.equal('rawWeekly' in (canonicalResidue ?? {}), false);

    const countsBeforeRepeat = await Promise.all([
      database.collection('factor_evidence_events').countDocuments({ runId }),
      database.collection('individual_factor_snapshots').countDocuments({ runId }),
      database.collection('pair_factor_evaluation_snapshots').countDocuments({ runId }),
      database.collection('migration_scope_sentinel').countDocuments({ runId }),
    ]);
    assert.deepEqual(countsBeforeRepeat, [1, 1, 1, 1]);
    const afterApply = await pairEvents.find({}).sort({ _id: 1 }).toArray();

    const repeated = await runPairEventNewOnlyMigration({
      mode: 'NEW_ONLY',
      batchSize: 1,
      now,
    });
    assert.equal(repeated.bound, 0);
    assert.equal(repeated.scrubbedCanonical, 0);
    assert.equal(repeated.retiredUnsafe, 0);
    assert.equal(repeated.retiredInvalid, 0);
    assert.equal(repeated.alreadyCanonical, 1);
    assert.equal(repeated.alreadyMigrated, 10);
    assert.deepEqual(
      await pairEvents.find({}).sort({ _id: 1 }).toArray(),
      afterApply,
      'repeated NEW_ONLY migration must be a no-op'
    );
    assert.deepEqual(
      await Promise.all([
        database.collection('factor_evidence_events').countDocuments({ runId }),
        database.collection('individual_factor_snapshots').countDocuments({ runId }),
        database.collection('pair_factor_evaluation_snapshots').countDocuments({ runId }),
        database.collection('migration_scope_sentinel').countDocuments({ runId }),
      ]),
      countsBeforeRepeat,
      'migration must not invent evidence, snapshots, or touch other collections'
    );

    const futureId = new Types.ObjectId();
    const pendingSafeId = new Types.ObjectId();
    const futureBinding = fixture(futureId, 'future-binding', {
      source: { kind: 'pair_lifecycle' },
      factorRegistryVersion: MVP_FACTOR_REGISTRY.registryVersion + 1,
      targetFactorKeys: [...PAIR_EVENT_CANONICAL_TARGET_FACTOR_KEYS],
    });
    delete futureBinding.axis;
    await pairEvents.insertMany([
      futureBinding,
      fixture(pendingSafeId, 'pending-safe'),
    ]);
    await assert.rejects(
      runPairEventNewOnlyMigration({ mode: 'NEW_ONLY', batchSize: 2, now }),
      /refused 1 future-version conflict/
    );
    const pendingAfterRefusal = await pairEvents.findOne({ _id: pendingSafeId });
    assert.ok(pendingAfterRefusal);
    assert.equal('factorRegistryVersion' in pendingAfterRefusal, false);
    assert.equal('targetFactorKeys' in pendingAfterRefusal, false);
    assert.equal('factorEngineCutover' in pendingAfterRefusal, false);
    await pairEvents.deleteMany({ _id: { $in: [futureId, pendingSafeId] } });

    console.log(
      JSON.stringify({
        integration: 'pair-event-new-only-migration',
        database: isolatedDatabase,
        scanned: applied.scanned,
        bound: applied.bound,
        scrubbedCanonical: applied.scrubbedCanonical,
        retiredUnsafe: applied.retiredUnsafe,
        retiredInvalid: applied.retiredInvalid,
        repeatedWrites:
          repeated.bound +
          repeated.scrubbedCanonical +
          repeated.retiredUnsafe +
          repeated.retiredInvalid,
        evidenceWrites: applied.evidenceWrites,
        snapshotWrites: applied.snapshotWrites,
      })
    );
  } finally {
    await database.dropDatabase();
    await mongoose.disconnect();
  }
};

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
