import type { FactorAggregationStatus } from '@/domain/model/aggregation/factorAggregation';
import type {
  DomainDefinition,
  FactorDefinition,
  FactorRegistryRelease,
} from '@/domain/model/definitions/definitionTypes';
import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import { fromStoredFactorValue, type StoredFactorValue, type StoredAggregationMetrics } from '@/models/factorEngineSchemas';
import { MEASUREMENT_TESTS } from '@/domain/model/measurements/catalog';

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
  kind?: string;
  valuePresentation?: { label: string; scale: { value: number; min: number; max: number; low: string; high: string } | null };
  nextStep?: { href: string; label: string };
  history?: { at: string; label: string; explanation: string }[];
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
  value?: StoredFactorValue;
  history?: FactorSnapshotDTOInput[];
  unavailableReason?: 'VERSION_UNAVAILABLE';
};

export function presentFactorValue(factor: FactorDefinition, snapshot?: FactorSnapshotDTOInput): FactorSemanticCardDTO['valuePresentation'] {
  if (!snapshot?.value || snapshot.status !== 'AVAILABLE') return undefined;
  const value = fromStoredFactorValue(snapshot.value);
  const semantics = factor.semantics;
  if (value.kind === 'SCALAR' && factor.valueSchema.type === 'SCALAR' && (semantics.kind === 'BIPOLAR' || semantics.kind === 'ORDERED')) {
    const ratio = (value.value - factor.valueSchema.min) / (factor.valueSchema.max - factor.valueSchema.min);
    const label = semantics.kind === 'BIPOLAR' ? (value.value < -0.25 ? semantics.lowPole.label : value.value > 0.25 ? semantics.highPole.label : semantics.midpointLabel)
      : ratio < 0.35 ? semantics.lowPole.label : ratio > 0.65 ? semantics.highPole.label : 'средний диапазон самоотчёта';
    return { label, scale: { value: value.value, min: factor.valueSchema.min, max: factor.valueSchema.max, low: semantics.lowPole.label, high: semantics.highPole.label } };
  }
  if (value.kind === 'MASTERY') return { label: value.level === 'BASIC' ? 'в этих ситуациях пока нужна поддержка' : value.level === 'INTERMEDIATE' ? 'часть шагов восстановления уже удаётся' : 'в этих ситуациях удалось восстановить разговор самостоятельно', scale: { value: value.score01, min: 0, max: 1, low: 'нужна поддержка', high: 'самостоятельное восстановление' } };
  if (value.kind === 'CONSTRAINT' || value.kind === 'CATEGORY' || value.kind === 'ORDINAL') return { label: semantics.kind !== 'BIPOLAR' ? semantics.labels.find((item) => item.key === value.value)?.label ?? value.value : value.value, scale: null };
  return undefined;
}

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
      const valuePresentation = snapshot?.unavailableReason ? undefined : presentFactorValue(factor, snapshot);
      const test = MEASUREMENT_TESTS.find((test) => test.questions.some((question) => registry.measurements.some((measurement) => measurement.key === question.measurementKey && measurement.factorKey === factor.key)));
      const history = (snapshot?.unavailableReason ? [] : snapshot?.history ?? (snapshot ? [snapshot] : [])).slice(0, 5).map((entry, index, entries) => {
        const label = presentFactorValue(factor, entry)?.label ?? STATUS_PRESENTATION[toProfileStatus(entry.status)].label;
        const prior = entries[index + 1];
        return { at: entry.calculatedAt.toISOString(), label, explanation: prior && presentFactorValue(factor, prior)?.label === label ? 'Новое наблюдение или пересчёт свежести; смысл результата сохранился.' : 'Сохранённая версия собственного результата.' };
      });

      return {
        factorKey: factor.key,
        domain: {
          key: factor.domainKey,
          title: factor.key.startsWith('sharedLife.values.') || factor.domainKey === 'lifePlans' ? 'Взгляды и ценности' : factor.domainKey === 'sharedLife' ? 'Быт и забота' : factor.domainKey === 'wellbeing' ? 'Состояние и восстановление' : domain?.title ?? 'Другой раздел',
        },
        dimension: {
          key: factor.dimensionKey,
          title: dimension?.title ?? 'Другое измерение',
        },
        title: factor.title,
        description: factor.description,
        status,
        statusLabel: snapshot?.unavailableReason ? 'Сохранённая версия недоступна' : presentation.label,
        neutralWording: snapshot?.unavailableReason ? 'Ваши данные сохранены, но их версия сейчас не может быть безопасно рассчитана. Требуется восстановление совместимой публикации; повторная сдача теста не нужна.' : valuePresentation ? `Ваш ориентир: ${valuePresentation.label}. ${factor.type === 'STATE' ? 'Это временное состояние, а не черта личности.' : 'Результат описывает ваши ответы, а не оценивает человека.'}` : presentation.neutralWording,
        kind: factor.type,
        valuePresentation,
        history,
        nextStep: test ? { href: `/measurements/${test.key}`, label: status === 'AVAILABLE' ? 'Открыть анкету и сохранённый результат' : 'Анкета и доступные следующие шаги' } : factor.key === 'sharedLife.roles.householdCapability' ? { href: '/development', label: 'Совместные практики и обратная связь' } : { href: factor.type === 'STATE' ? '/pair' : '/profile/matching', label: factor.type === 'STATE' ? 'Открыть текущий цикл пары' : 'Открыть собственные данные для знакомств' },
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
