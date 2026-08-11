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

export type PairDTO = {
  id: string;
  _id?: string;
  members: [string, string];
  key: string;
  status: PairType['status'];
  createdAt?: string;
  updatedAt?: string;
};

export type ToPairDtoOptions = {
  includeLegacyId?: boolean;
};

export function toPairDTO(pair: PairSource, opts: ToPairDtoOptions = {}): PairDTO {
  const includeLegacyId = opts.includeLegacyId ?? false;

  const id = toId(pair._id);
  const members: [string, string] = [pair.members[0], pair.members[1]];

  const dto: PairDTO = {
    id,
    members,
    key: pair.key,
    status: pair.status,
    createdAt: toIso(pair.createdAt),
    updatedAt: toIso(pair.updatedAt),
  };

  if (includeLegacyId) dto._id = id;

  return dto;
}

