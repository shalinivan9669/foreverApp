import { MVP_FACTOR_REGISTRY } from '@/domain/model/definitions/mvpDefinitions';
import mongoose from 'mongoose';
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
import { recoverMeasurementResults } from '@/domain/services/measurementTests.service';
import { getOwnerAssessmentProfile } from '@/domain/services/assessmentRuns.service';
import { bridgeCompatibleProfileEvidence } from './profileEvidenceCompatibility.service';

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
  let effectiveAt = new Date();
  const [user, initialPair] = await Promise.all([
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
  let activePair = initialPair;

  await recoverMeasurementResults(ownerId);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fence = await User.updateOne({ id: ownerId }, { $inc: { pairMembershipRevision: 1 } }, { session });
      if (fence.matchedCount !== 1) return;
      activePair = await Pair.findOne({ members: ownerId, status: { $in: ['active', 'paused'] } }).sort({ createdAt: -1 }).select({ _id: 1 }).session(session).lean<{ _id: import('mongoose').Types.ObjectId } | null>();
      await bridgeCompatibleProfileEvidence(ownerId, undefined, session);
      if (activePair) await bridgeCompatibleProfileEvidence(ownerId, String(activePair._id), session);
      effectiveAt = new Date();
      await materializeCurrentOwnerFactorSnapshots({ subjectId: ownerId, calculatedAt: effectiveAt, session });
      if (activePair) await materializeCurrentOwnerFactorSnapshots({ subjectId: ownerId, pairId: String(activePair._id), calculatedAt: effectiveAt, session });
    });
  } finally { await session.endSession(); }
  const snapshots =
    await IndividualFactorSnapshot.aggregate<FactorProfileSnapshotRow>([
      {
        $match: {
          subjectId: ownerId,
          projectionPurpose: 'OWNER_PROFILE',
          factorKey: { $in: factorKeys },
          $or: [{ contextPairId: { $exists: false } }, ...(activePair ? [{ contextPairId: String(activePair._id) }] : [])],
        },
      },
      { $sort: { factorKey: 1, calculatedAt: -1, revision: -1 } },
      { $group: { _id: '$factorKey', document: { $first: '$$ROOT' }, history: { $firstN: { input: '$$ROOT', n: 5 } } } },
      { $set: { 'document.history': '$history' } },
      { $replaceWith: '$document' },
      {
        $project: {
          _id: 0,
          subjectId: 1,
          projectionPurpose: 1,
          factorKey: 1,
          revision: 1,
          status: 1,
          value: 1,
          history: 1,
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
      if (factor && snapshot.projectionPurpose === 'OWNER_PROFILE') effectiveSnapshots.push({ ...snapshot, status: 'UNKNOWN', value: undefined, history: [], ...(!snapshotVersionsMatchRegistry(snapshot.versions, factor, MVP_FACTOR_REGISTRY) ? { unavailableReason: 'VERSION_UNAVAILABLE' as const } : {}) });
      continue;
    }
    effectiveSnapshots.push({ ...snapshot, history: snapshot.history?.filter((entry) => { const versioned = entry as FactorProfileSnapshotRow; return snapshotVersionsMatchRegistry(versioned.versions, factor, MVP_FACTOR_REGISTRY); }) });
  }

  if (!await User.exists({ id: ownerId })) return null;
  if (activePair && !await Pair.exists({ _id: activePair._id, members: ownerId, status: { $in: ['active', 'paused'] } })) return getOwnerFactorProfileSummary(ownerId);

  const avatarUrl = user.avatar
    ? toDiscordAvatarUrl(user.id, user.avatar)
    : null;
  const assessments = await getOwnerAssessmentProfile(ownerId);

  return {
    ...(assessments ? { assessments } : {}),
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
