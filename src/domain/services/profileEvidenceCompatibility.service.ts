import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { MVP_FACTOR_REGISTRY, MVP_FACTOR_REGISTRY_V7 } from '@/domain/model/definitions/mvpDefinitions';
import { createEvidenceEvent } from '@/domain/model/evidence/evidence';
import { EvidenceEvent, type EvidenceEventType } from '@/models/EvidenceEvent';
import { materializeIndividual, toDomainEvidenceEvent } from './activityFactorRuntime.service';
import { refreshMeasuredMatchingProfile } from './matching/matchingProfileRuntime.service';
import { fromStoredFactorValue } from '@/models/factorEngineSchemas';
import { seedDefinitionRegistryRelease, upsertEvidenceEvent } from './factorEnginePersistence.service';

/** Only the reviewed v7 → v8 additive change is compatible. No generic reinterpretation. */
export async function bridgeCompatibleProfileEvidence(ownerId: string, pairId: string | undefined, session: ClientSession): Promise<void> {
  const previous = await EvidenceEvent.aggregate<EvidenceEventType>([
    { $match: { actorId: ownerId, subjectId: ownerId, subjectKind: 'INDIVIDUAL', observationScope: 'SELF', status: 'ACCEPTED', captureMode: { $ne: 'SYSTEM_ONLY' }, 'versions.registryVersion': 7,
      ...(pairId ? { pairId } : { pairId: { $exists: false } }) } },
    { $sort: { observedAt: -1, eventId: -1 } }, { $group: { _id: '$factorKey', events: { $firstN: { input: '$$ROOT', n: 64 } } } },
    { $unwind: '$events' }, { $replaceWith: '$events' },
  ]).session(session);
  if (!previous.length) return;
  const bridgeId = (eventId: string) => `fev_bridge_${createHash('sha256').update(`v7-v8:${eventId}`).digest('hex')}`;
  const existing = await EvidenceEvent.find({ eventId: { $in: previous.map((event) => bridgeId(event.eventId)) } }).select({ eventId: 1 }).session(session).lean();
  const existingIds = new Set(existing.map((event) => event.eventId));
  await seedDefinitionRegistryRelease(MVP_FACTOR_REGISTRY, new Date(), { session });
  const matchingKeys = new Set<string>();
  for (const stored of previous) {
    if (existingIds.has(bridgeId(stored.eventId))) continue;
    const oldFactor = MVP_FACTOR_REGISTRY_V7.factors.find((factor) => factor.key === stored.factorKey);
    const factor = MVP_FACTOR_REGISTRY.factors.find((factor) => factor.key === stored.factorKey);
    const oldMeasurement = MVP_FACTOR_REGISTRY_V7.measurements.find((item) => item.key === stored.measurementKey);
    const measurement = MVP_FACTOR_REGISTRY.measurements.find((item) => item.key === stored.measurementKey);
    const oldInstrument = MVP_FACTOR_REGISTRY_V7.instruments.find((item) => item.key === stored.instrumentKey);
    const instrument = MVP_FACTOR_REGISTRY.instruments.find((item) => item.key === stored.instrumentKey);
    if (!factor || !oldFactor || !measurement || !oldMeasurement || !instrument || !oldInstrument) continue;
    const unchanged = ['type', 'valueSchema', 'semantics', 'aggregationStrategy', 'freshnessPolicy', 'confidenceRequirements', 'privacyClass'] as const;
    if (unchanged.some((field) => JSON.stringify(factor[field]) !== JSON.stringify(oldFactor[field])) || JSON.stringify(measurement) !== JSON.stringify(oldMeasurement) || JSON.stringify(instrument) !== JSON.stringify(oldInstrument)) continue;
    if (stored.versions.definitionVersion !== oldFactor.definitionVersion || stored.versions.algorithmVersion !== MVP_FACTOR_REGISTRY_V7.algorithmVersion || stored.versions.measurementVersion !== measurement.measurementVersion || stored.versions.instrumentVersion !== instrument.instrumentVersion || !stored.normalizedValue) continue;
    const event = createEvidenceEvent({ ...stored, eventId: bridgeId(stored.eventId), idempotencyKey: `bridge:${stored.eventId}`, submittedValue: fromStoredFactorValue(stored.submittedValue),
      reliabilityMultiplier: stored.reliability / measurement.reliability, recordedAt: new Date(), registryVersion: MVP_FACTOR_REGISTRY.registryVersion, algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion }, factor, measurement, instrument);
    if (event.status !== 'ACCEPTED' || event.sourceHash !== stored.sourceHash || JSON.stringify(event.normalizedValue) !== JSON.stringify(fromStoredFactorValue(stored.normalizedValue))) continue;
    await upsertEvidenceEvent(event, MVP_FACTOR_REGISTRY, { session });
    if (!pairId && event.purpose === 'MATCHING' && factor.matchingPolicy?.enabled) matchingKeys.add(factor.key);
  }
  for (const key of matchingKeys) {
    const factor = MVP_FACTOR_REGISTRY.factors.find((item) => item.key === key)!;
    const events = await EvidenceEvent.find({ actorId: ownerId, subjectId: ownerId, observationScope: 'SELF', pairId: { $exists: false }, purpose: 'MATCHING', factorKey: key, status: 'ACCEPTED', 'versions.registryVersion': MVP_FACTOR_REGISTRY.registryVersion }).sort({ observedAt: -1, eventId: -1 }).limit(64).session(session).lean<EvidenceEventType[]>();
    await materializeIndividual({ subjectId: ownerId, factor, projectionPurpose: 'MATCHING', events: events.map(toDomainEvidenceEvent), fallbackCalculatedAt: new Date(), session });
  }
  if (matchingKeys.size) await refreshMeasuredMatchingProfile(ownerId, session, new Date());
}
