import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import {
  isSnapshotEffectiveAt,
  snapshotVersionsMatchRegistry,
} from '@/domain/model/snapshots/snapshots';
import { toDiscordAvatarUrl } from '@/lib/discord/avatar';
import { connectToDatabase } from '@/lib/mongodb';
import {
  toOwnerFactorProfileDTO,
  type FactorSnapshotDTOInput,
  type ProfileSummaryDTO,
} from '@/lib/dto/factorProfile.dto';
import {
  IndividualFactorSnapshot,
  type IndividualFactorSnapshotType,
} from '@/models/IndividualFactorSnapshot';
import { User, type UserType } from '@/models/User';
import { Pair } from '@/models/Pair';
import { materializeCurrentOwnerFactorSnapshots } from '@/domain/services/activityFactorRuntime.service';

type ProfileUserSource = Pick<
  UserType,
  'id' | 'username' | 'avatar' | 'createdAt' | 'updatedAt'
>;

type FactorProfileSnapshotRow = FactorSnapshotDTOInput &
  Pick<
    IndividualFactorSnapshotType,
    'projectionPurpose' | 'versions' | 'effectiveFrom' | 'effectiveUntil'
  >;

const toIsoString = (value: Date | undefined): string | null =>
  value ? value.toISOString() : null;

export async function getOwnerFactorProfileSummary(
  ownerId: string
): Promise<ProfileSummaryDTO | null> {
  await connectToDatabase();

  const factorKeys = MVP_FACTOR_REGISTRY.factors.map((factor) => factor.key);
  const effectiveAt = new Date();
  const [user, activePair] = await Promise.all([
    User.findOne({ id: ownerId })
      .select({ id: 1, username: 1, avatar: 1, createdAt: 1, updatedAt: 1 })
      .lean<ProfileUserSource | null>(),
    Pair.findOne({
      members: ownerId,
      status: { $in: ['active', 'paused'] },
    })
      .sort({ createdAt: -1 })
      .select({ _id: 1 })
      .lean<{ _id: import('mongoose').Types.ObjectId } | null>(),
  ]);

  if (!user) return null;

  await materializeCurrentOwnerFactorSnapshots({
    subjectId: ownerId,
    calculatedAt: effectiveAt,
  });
  if (activePair) {
    await materializeCurrentOwnerFactorSnapshots({
      subjectId: ownerId,
      pairId: String(activePair._id),
      calculatedAt: effectiveAt,
    });
  }
  const snapshots =
    await IndividualFactorSnapshot.aggregate<FactorProfileSnapshotRow>([
      {
        $match: {
          subjectId: ownerId,
          projectionPurpose: 'OWNER_PROFILE',
          factorKey: { $in: factorKeys },
        },
      },
      { $sort: { factorKey: 1, calculatedAt: -1, revision: -1 } },
      { $group: { _id: '$factorKey', document: { $first: '$$ROOT' } } },
      { $replaceWith: '$document' },
      {
        $project: {
          _id: 0,
          subjectId: 1,
          projectionPurpose: 1,
          factorKey: 1,
          revision: 1,
          status: 1,
          metrics: 1,
          calculatedAt: 1,
          versions: 1,
          effectiveFrom: 1,
          effectiveUntil: 1,
        },
      },
      { $sort: { factorKey: 1 } },
      { $limit: factorKeys.length },
    ]).exec();

  const factorsByKey = new Map(
    MVP_FACTOR_REGISTRY.factors.map((factor) => [factor.key, factor] as const)
  );
  const seenFactorKeys = new Set<string>();
  const effectiveSnapshots: FactorSnapshotDTOInput[] = [];
  for (const snapshot of snapshots) {
    if (seenFactorKeys.has(snapshot.factorKey)) continue;
    seenFactorKeys.add(snapshot.factorKey);
    const factor = factorsByKey.get(snapshot.factorKey);
    if (
      !factor ||
      snapshot.projectionPurpose !== 'OWNER_PROFILE' ||
      !snapshotVersionsMatchRegistry(
        snapshot.versions,
        factor,
        MVP_FACTOR_REGISTRY
      ) ||
      !isSnapshotEffectiveAt(snapshot, effectiveAt)
    ) {
      continue;
    }
    effectiveSnapshots.push(snapshot);
  }

  const avatarUrl = user.avatar
    ? toDiscordAvatarUrl(user.id, user.avatar)
    : null;

  return {
    user: {
      id: user.id,
      name: user.username,
      handle: user.username,
      avatarUrl,
      joinedAt: toIsoString(user.createdAt),
      lastActiveAt: toIsoString(user.updatedAt),
    },
    factorProfile: toOwnerFactorProfileDTO({
      ownerId,
      snapshots: effectiveSnapshots,
      registry: MVP_FACTOR_REGISTRY,
    }),
  };
}
