import type { FactorAggregationStatus } from '@/domain/model/aggregation/factorAggregation';
import type {
  DomainDefinition,
  FactorDefinition,
  FactorRegistryRelease,
} from '@/domain/model/definitions/definitionTypes';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import type { StoredAggregationMetrics } from '@/models/factorEngineSchemas';

export type FactorProfileStatus =
  | 'AVAILABLE'
  | 'MISSING'
  | 'UNKNOWN'
  | 'INSUFFICIENT';

export type FactorConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export type FactorFreshnessBand = 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN';

export type FactorSemanticCardDTO = {
  factorKey: string;
  domain: {
    key: string;
    title: string;
  };
  dimension: {
    key: string;
    title: string;
  };
  title: string;
  description: string;
  status: FactorProfileStatus;
  statusLabel: string;
  neutralWording: string;
  confidence: {
    band: FactorConfidenceBand;
    label: string;
  };
  freshness: {
    band: FactorFreshnessBand;
    label: string;
    calculatedAt: string | null;
  };
};

export type ProfileSummaryDTO = {
  user: {
    id: string;
    name: string;
    handle: string;
    avatarUrl: string | null;
    joinedAt: string | null;
    lastActiveAt: string | null;
  };
  factorProfile: {
    scope: 'OWNER';
    source: 'INDIVIDUAL_FACTOR_SNAPSHOT';
    registryVersion: number;
    latestCalculatedAt: string | null;
    cards: FactorSemanticCardDTO[];
  };
};

export type FactorSnapshotDTOInput = {
  subjectId: string;
  factorKey: string;
  revision: number;
  status: FactorAggregationStatus;
  metrics: StoredAggregationMetrics;
  calculatedAt: Date;
};

const STATUS_PRESENTATION: Record<
  FactorProfileStatus,
  { label: string; neutralWording: string }
> = {
  AVAILABLE: {
    label: 'Доступен',
    neutralWording:
      'По вашим данным сформирован личный ориентир. Он может меняться по мере новых ответов.',
  },
  MISSING: {
    label: 'Нет данных',
    neutralWording: 'Пока нет личных данных для этого фактора.',
  },
  UNKNOWN: {
    label: 'Не определён',
    neutralWording: 'Текущие данные не позволяют надёжно определить состояние фактора.',
  },
  INSUFFICIENT: {
    label: 'Недостаточно данных',
    neutralWording: 'Данных пока недостаточно для устойчивого личного ориентира.',
  },
};

const CONFIDENCE_LABELS: Record<FactorConfidenceBand, string> = {
  HIGH: 'Высокая уверенность',
  MEDIUM: 'Средняя уверенность',
  LOW: 'Низкая уверенность',
  UNKNOWN: 'Уверенность не определена',
};

const FRESHNESS_LABELS: Record<FactorFreshnessBand, string> = {
  CURRENT: 'Данные актуальны',
  AGING: 'Данные постепенно устаревают',
  STALE: 'Данные стоит обновить',
  UNKNOWN: 'Свежесть не определена',
};

const toProfileStatus = (status: FactorAggregationStatus): FactorProfileStatus => {
  switch (status) {
    case 'AVAILABLE':
      return 'AVAILABLE';
    case 'MISSING':
      return 'MISSING';
    case 'UNKNOWN':
    case 'INVALID':
      return 'UNKNOWN';
    case 'INSUFFICIENT_DATA':
      return 'INSUFFICIENT';
  }
};

const confidenceBand = (
  status: FactorProfileStatus,
  confidence: number
): FactorConfidenceBand => {
  if (status !== 'AVAILABLE') return 'UNKNOWN';
  if (confidence >= 0.75) return 'HIGH';
  if (confidence >= 0.45) return 'MEDIUM';
  return 'LOW';
};

const freshnessBand = (
  status: FactorProfileStatus,
  freshness: number
): FactorFreshnessBand => {
  if (status !== 'AVAILABLE') return 'UNKNOWN';
  if (freshness >= 0.7) return 'CURRENT';
  if (freshness >= 0.35) return 'AGING';
  return 'STALE';
};

const isNewerSnapshot = (
  candidate: FactorSnapshotDTOInput,
  current: FactorSnapshotDTOInput
): boolean => {
  const candidateTime = candidate.calculatedAt.getTime();
  const currentTime = current.calculatedAt.getTime();
  return candidateTime > currentTime ||
    (candidateTime === currentTime && candidate.revision > current.revision);
};

const latestOwnerSnapshots = (
  ownerId: string,
  snapshots: readonly FactorSnapshotDTOInput[]
): Map<string, FactorSnapshotDTOInput> => {
  const latestByFactor = new Map<string, FactorSnapshotDTOInput>();

  for (const snapshot of snapshots) {
    if (snapshot.subjectId !== ownerId) continue;
    const current = latestByFactor.get(snapshot.factorKey);
    if (!current || isNewerSnapshot(snapshot, current)) {
      latestByFactor.set(snapshot.factorKey, snapshot);
    }
  }

  return latestByFactor;
};

const factorOrder = (
  factor: FactorDefinition,
  domains: ReadonlyMap<string, DomainDefinition>,
  dimensionOrders: ReadonlyMap<string, number>
): [number, number, string] => [
  domains.get(factor.domainKey)?.order ?? Number.MAX_SAFE_INTEGER,
  dimensionOrders.get(factor.dimensionKey) ?? Number.MAX_SAFE_INTEGER,
  factor.title,
];

const compareFactorOrder = (
  left: FactorDefinition,
  right: FactorDefinition,
  domains: ReadonlyMap<string, DomainDefinition>,
  dimensionOrders: ReadonlyMap<string, number>
): number => {
  const a = factorOrder(left, domains, dimensionOrders);
  const b = factorOrder(right, domains, dimensionOrders);
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2], 'ru');
};

export const toOwnerFactorProfileDTO = (input: {
  ownerId: string;
  snapshots: readonly FactorSnapshotDTOInput[];
  registry?: FactorRegistryRelease;
}): ProfileSummaryDTO['factorProfile'] => {
  const registry = input.registry ?? MVP_FACTOR_REGISTRY;
  const domains = new Map(registry.domains.map((domain) => [domain.key, domain]));
  const dimensions = new Map(
    registry.dimensions.map((dimension) => [dimension.key, dimension])
  );
  const dimensionOrders = new Map(
    registry.dimensions.map((dimension) => [dimension.key, dimension.order])
  );
  const latestByFactor = latestOwnerSnapshots(input.ownerId, input.snapshots);
  const cards = [...registry.factors]
    .sort((left, right) =>
      compareFactorOrder(left, right, domains, dimensionOrders)
    )
    .map((factor): FactorSemanticCardDTO => {
      const domain = domains.get(factor.domainKey);
      const dimension = dimensions.get(factor.dimensionKey);
      const snapshot = latestByFactor.get(factor.key);
      const status = snapshot ? toProfileStatus(snapshot.status) : 'MISSING';
      const presentation = STATUS_PRESENTATION[status];
      const confidence = snapshot
        ? confidenceBand(status, snapshot.metrics.confidence)
        : 'UNKNOWN';
      const freshness = snapshot
        ? freshnessBand(status, snapshot.metrics.freshness)
        : 'UNKNOWN';

      return {
        factorKey: factor.key,
        domain: {
          key: factor.domainKey,
          title: domain?.title ?? 'Другой раздел',
        },
        dimension: {
          key: factor.dimensionKey,
          title: dimension?.title ?? 'Другое измерение',
        },
        title: factor.title,
        description: factor.description,
        status,
        statusLabel: presentation.label,
        neutralWording: presentation.neutralWording,
        confidence: {
          band: confidence,
          label: CONFIDENCE_LABELS[confidence],
        },
        freshness: {
          band: freshness,
          label: FRESHNESS_LABELS[freshness],
          calculatedAt: snapshot?.calculatedAt.toISOString() ?? null,
        },
      };
    });
  const latestCalculatedAt = cards.reduce<string | null>((latest, card) => {
    const calculatedAt = card.freshness.calculatedAt;
    if (!calculatedAt || (latest && calculatedAt <= latest)) return latest;
    return calculatedAt;
  }, null);

  return {
    scope: 'OWNER',
    source: 'INDIVIDUAL_FACTOR_SNAPSHOT',
    registryVersion: registry.registryVersion,
    latestCalculatedAt,
    cards,
  };
};
