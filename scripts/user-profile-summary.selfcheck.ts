import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  toOwnerFactorProfileDTO,
  type FactorSnapshotDTOInput,
} from '@/lib/dto/factorProfile.dto';

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const metrics = (
  confidence: number,
  freshness: number
): FactorSnapshotDTOInput['metrics'] => ({
  confidence,
  freshness,
  coverage: 0.8,
  consistency: 0.9,
  evidenceCount: 3,
});

type PrivacyProbeSnapshot = FactorSnapshotDTOInput & {
  rawValue?: number;
  partnerMarker?: string;
};

const [availableFactor, missingFactor, unknownFactor, insufficientFactor, invalidFactor] =
  MVP_FACTOR_REGISTRY.factors;

assert(Boolean(invalidFactor), 'registry must contain at least five factors');

const snapshots: PrivacyProbeSnapshot[] = [
  {
    subjectId: 'owner-1',
    factorKey: availableFactor.key,
    revision: 1,
    status: 'AVAILABLE',
    metrics: metrics(0.9, 0.9),
    calculatedAt: new Date('2026-07-01T00:00:00.000Z'),
    rawValue: 0.99,
  },
  {
    subjectId: 'owner-1',
    factorKey: availableFactor.key,
    revision: 2,
    status: 'AVAILABLE',
    metrics: metrics(0.55, 0.5),
    calculatedAt: new Date('2026-08-01T00:00:00.000Z'),
    rawValue: 0.12,
  },
  {
    subjectId: 'owner-1',
    factorKey: unknownFactor.key,
    revision: 1,
    status: 'UNKNOWN',
    metrics: metrics(0, 0),
    calculatedAt: new Date('2026-07-20T00:00:00.000Z'),
  },
  {
    subjectId: 'owner-1',
    factorKey: insufficientFactor.key,
    revision: 1,
    status: 'INSUFFICIENT_DATA',
    metrics: metrics(0, 0),
    calculatedAt: new Date('2026-07-21T00:00:00.000Z'),
  },
  {
    subjectId: 'owner-1',
    factorKey: invalidFactor.key,
    revision: 1,
    status: 'INVALID',
    metrics: metrics(0, 0),
    calculatedAt: new Date('2026-07-22T00:00:00.000Z'),
  },
  {
    subjectId: 'partner-2',
    factorKey: missingFactor.key,
    revision: 50,
    status: 'AVAILABLE',
    metrics: metrics(0.99, 0.99),
    calculatedAt: new Date('2026-08-10T00:00:00.000Z'),
    rawValue: 0.777,
    partnerMarker: 'PARTNER_SECRET_MARKER',
  },
];

const profile = toOwnerFactorProfileDTO({
  ownerId: 'owner-1',
  snapshots,
});

assert(profile.scope === 'OWNER', 'profile scope must be OWNER');
assert(
  profile.source === 'INDIVIDUAL_FACTOR_SNAPSHOT',
  'profile must declare the snapshot source'
);
assert(
  profile.cards.length === MVP_FACTOR_REGISTRY.factors.length,
  'every registered factor must have one semantic card'
);
assert(
  new Set(profile.cards.map((card) => card.factorKey)).size === profile.cards.length,
  'factor cards must be unique'
);
assert(
  profile.cards.every(
    (card) =>
      card.domain.title.trim().length > 0 &&
      card.dimension.title.trim().length > 0 &&
      card.title.trim().length > 0
  ),
  'domain, dimension, and factor titles must be explicit'
);

const byFactor = new Map(profile.cards.map((card) => [card.factorKey, card]));
const availableCard = byFactor.get(availableFactor.key);
const missingCard = byFactor.get(missingFactor.key);
const unknownCard = byFactor.get(unknownFactor.key);
const insufficientCard = byFactor.get(insufficientFactor.key);
const invalidCard = byFactor.get(invalidFactor.key);

assert(availableCard?.status === 'AVAILABLE', 'available status expected');
assert(
  availableCard?.confidence.band === 'MEDIUM',
  'latest owner snapshot must determine the confidence band'
);
assert(
  availableCard?.freshness.band === 'AGING',
  'freshness must be exposed as a semantic band'
);
assert(
  availableCard?.freshness.calculatedAt === '2026-08-01T00:00:00.000Z',
  'latest calculated owner snapshot must win'
);
assert(
  missingCard?.status === 'MISSING',
  'a partner snapshot must not fill an owner factor'
);
assert(missingCard?.freshness.band === 'UNKNOWN', 'missing freshness must be unknown');
assert(unknownCard?.status === 'UNKNOWN', 'unknown status expected');
assert(insufficientCard?.status === 'INSUFFICIENT', 'insufficient status expected');
assert(invalidCard?.status === 'UNKNOWN', 'invalid data must use safe unknown semantics');

const serialized = JSON.stringify(profile);
for (const forbiddenKey of [
  'rawValue',
  'partnerMarker',
  'PARTNER_SECRET_MARKER',
  'scalarValue',
  'score01',
  'evidenceIds',
  'contextPairId',
  'metrics',
]) {
  assert(!serialized.includes(forbiddenKey), `forbidden data exposed: ${forbiddenKey}`);
}

const neutralWording = profile.cards
  .map((card) => `${card.description} ${card.neutralWording}`)
  .join(' ')
  .toLowerCase();
for (const forbiddenPhrase of [
  'диагноз',
  'депрессия',
  'токсичный',
  'партнёр должен',
  'ты обязан',
]) {
  assert(
    !neutralWording.includes(forbiddenPhrase),
    `non-neutral wording found: ${forbiddenPhrase}`
  );
}

console.log('user-profile-summary selfcheck passed');
