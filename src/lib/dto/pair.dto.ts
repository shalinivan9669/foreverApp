import type { PairType } from '@/models/Pair';

type IdLike = string | { toString(): string };
type DateLike = Date | string | undefined | null;

const toId = (value: IdLike | undefined): string => (value ? String(value) : '');
const toIso = (value: DateLike): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  return value.toISOString();
};

type PairSource = PairType & { _id?: IdLike };

export type PairPassportDTO = {
  strongSides: { axis: string; facets: string[] }[];
  riskZones: { axis: string; facets: string[]; severity: 1 | 2 | 3 }[];
  complementMap: { axis: string; A_covers_B: string[]; B_covers_A: string[] }[];
  levelDelta: { axis: string; delta: number }[];
  lastDiagnosticsAt?: string;
};

export type PairDTO = {
  id: string;
  _id?: string;
  members: [string, string];
  key: string;
  status: PairType['status'];
  activeActivity?: PairType['activeActivity'];
  progress?: PairType['progress'];
  passport?: PairPassportDTO;
  fatigue?: PairType['fatigue'];
  readiness?: PairType['readiness'];
  createdAt?: string;
  updatedAt?: string;
};

export type ToPairDtoOptions = {
  includeLegacyId?: boolean;
  includePassport?: boolean;
  includeMetrics?: boolean;
};

export function toPairDTO(pair: PairSource, opts: ToPairDtoOptions = {}): PairDTO {
  const includeLegacyId = opts.includeLegacyId ?? false;
  const includePassport = opts.includePassport ?? true;
  const includeMetrics = opts.includeMetrics ?? true;

  const id = toId(pair._id);
  const members: [string, string] = [pair.members[0], pair.members[1]];

  const dto: PairDTO = {
    id,
    members,
    key: pair.key,
    status: pair.status,
    activeActivity: pair.activeActivity,
    progress: pair.progress,
    createdAt: toIso(pair.createdAt),
    updatedAt: toIso(pair.updatedAt),
  };

  if (includeLegacyId) dto._id = id;

  if (includeMetrics) {
    if (pair.fatigue) dto.fatigue = pair.fatigue;
    if (pair.readiness) dto.readiness = pair.readiness;
  }

  if (includePassport && pair.passport) {
    dto.passport = {
      strongSides: pair.passport.strongSides ?? [],
      riskZones: pair.passport.riskZones ?? [],
      complementMap: pair.passport.complementMap ?? [],
      levelDelta: pair.passport.levelDelta ?? [],
      lastDiagnosticsAt: toIso(pair.passport.lastDiagnosticsAt),
    };
  }

  return dto;
}

