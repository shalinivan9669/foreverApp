import { Types } from 'mongoose';
import { connectToDatabase } from '@/lib/mongodb';
import { Like, type LikeType } from '@/models/Like';
import { Pair } from '@/models/Pair';
import { PairActivity } from '@/models/PairActivity';
import { ActivityTemplate, type ActivityTemplateType, type Axis } from '@/models/ActivityTemplate';
import { User, type UserType } from '@/models/User';
import { requireLikeParticipant } from '@/lib/auth/resourceGuards';
import { DomainError } from '@/domain/errors';
import { matchTransition } from '@/domain/state/matchMachine';

type GuardErrorPayload = {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
};

const guardFailureToDomainError = async (response: Response): Promise<DomainError> => {
  const payload = await response
    .clone()
    .json()
    .catch(() => null) as GuardErrorPayload | null;

  return new DomainError({
    code: payload?.error?.code ?? 'INTERNAL',
    status: response.status || 500,
    message: payload?.error?.message ?? 'Request failed',
  });
};

const ensureLikeParticipant = async (
  likeId: string,
  currentUserId: string
): Promise<{ like: { _id: Types.ObjectId } & LikeType; role: 'from' | 'to' }> => {
  const likeGuard = await requireLikeParticipant(likeId, currentUserId);
  if (!likeGuard.ok) {
    throw await guardFailureToDomainError(likeGuard.response);
  }
  return likeGuard.data;
};

const sanitize = (value: string | null | undefined, maxLength: number): string =>
  String(value ?? '').trim().slice(0, maxLength);

const buildInitiatorSnapshot = (
  user: UserType | null
): LikeType['fromCardSnapshot'] | undefined => {
  const card = user?.profile?.matchCard;
  if (!card?.isActive) return undefined;
  if (!card.requirements?.length || !card.questions?.length) return undefined;

  return {
    requirements: [
      sanitize(card.requirements[0], 80),
      sanitize(card.requirements[1], 80),
      sanitize(card.requirements[2], 80),
    ],
    questions: [
      sanitize(card.questions[0], 120),
      sanitize(card.questions[1], 120),
    ],
    updatedAt: card.updatedAt,
  };
};

const AXES: readonly Axis[] = [
  'communication',
  'domestic',
  'personalViews',
  'finance',
  'sexuality',
  'psyche',
] as const;

const HIGH = 2.0;
const LOW = 0.75;
const DELTA = 2.0;

const intersect = (left: string[] = [], right: string[] = []): string[] =>
  left.filter((entry) => right.includes(entry));

const buildPassport = (left: UserType, right: UserType) => {
  const strongSides: { axis: Axis; facets: string[] }[] = [];
  const riskZones: { axis: Axis; facets: string[]; severity: 1 | 2 | 3 }[] = [];
  const complementMap: { axis: Axis; A_covers_B: string[]; B_covers_A: string[] }[] = [];
  const levelDelta: { axis: Axis; delta: number }[] = [];

  for (const axis of AXES) {
    const leftVector = left.vectors[axis];
    const rightVector = right.vectors[axis];

    const bothHigh = leftVector.level >= HIGH && rightVector.level >= HIGH;
    const bothLow = leftVector.level <= LOW && rightVector.level <= LOW;
    const delta = Math.abs(leftVector.level - rightVector.level);

    const positives = intersect(leftVector.positives, rightVector.positives);
    const negatives = intersect(leftVector.negatives, rightVector.negatives);
    const leftCoversRight = intersect(leftVector.positives, rightVector.negatives);
    const rightCoversLeft = intersect(rightVector.positives, leftVector.negatives);

    if (positives.length > 0 || bothHigh) {
      strongSides.push({ axis, facets: positives });
    }

    if (negatives.length > 0 || bothLow || delta > DELTA) {
      const severity: 1 | 2 | 3 =
        delta > DELTA + 1 ? 3 : bothLow || negatives.length >= 2 ? 2 : 1;
      riskZones.push({
        axis,
        facets: negatives.length > 0 ? negatives : [],
        severity,
      });
    }

    if (leftCoversRight.length > 0 || rightCoversLeft.length > 0) {
      complementMap.push({
        axis,
        A_covers_B: leftCoversRight,
        B_covers_A: rightCoversLeft,
      });
    }

    if (delta > 0.01) {
      levelDelta.push({ axis, delta });
    }
  }

  return { strongSides, riskZones, complementMap, levelDelta };
};

const seedSuggestionsForPair = async (pairId: Types.ObjectId): Promise<void> => {
  const hasOffered = await PairActivity.exists({ pairId, status: 'offered' });
  if (hasOffered) return;

  const pair = await Pair.findById(pairId).lean();
  if (!pair?.passport?.riskZones?.length) return;

  const topRisk = pair.passport.riskZones
    .slice()
    .sort((left, right) => right.severity - left.severity)[0] as {
    axis: Axis;
    severity: 1 | 2 | 3;
  };

  const expectedDifficulty = topRisk.severity;

  const templates = await ActivityTemplate.aggregate<ActivityTemplateType>([
    {
      $match: {
        axis: topRisk.axis,
        difficulty: {
          $in: [
            expectedDifficulty,
            Math.max(1, expectedDifficulty - 1),
            Math.min(5, expectedDifficulty + 1),
          ],
        },
      },
    },
    { $sample: { size: 3 } },
  ]);

  if (!templates.length) return;

  const users = await User.find({ id: { $in: pair.members } }).lean<(UserType & { _id: Types.ObjectId })[]>();
  const firstMember = users.find((user) => user.id === pair.members[0]);
  const secondMember = users.find((user) => user.id === pair.members[1]);

  if (!firstMember || !secondMember) {
    throw new DomainError({
      code: 'NOT_FOUND',
      status: 404,
      message: 'Pair members are missing',
    });
  }

  const members: [Types.ObjectId, Types.ObjectId] = [firstMember._id, secondMember._id];
  const now = new Date();

  await Promise.all(
    templates.map((template) =>
      PairActivity.create({
        pairId,
        members,
        intent: template.intent,
        archetype: template.archetype,
        axis: template.axis,
        facetsTarget: template.facetsTarget ?? [],
        title: template.title,
        description: template.description,
        why: {
          ru: `������ � ������ �� ��� ${topRisk.axis}`,
          en: `Work on ${topRisk.axis} risk`,
        },
        mode: 'together',
        sync: 'sync',
        difficulty: template.difficulty,
        intensity: template.intensity,
        timeEstimateMin: template.timeEstimateMin,
        costEstimate: template.costEstimate,
        location: template.location ?? 'any',
        materials: template.materials ?? [],
        offeredAt: now,
        dueAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
        requiresConsent: template.requiresConsent,
        status: 'offered',
        checkIns: template.checkIns,
        effect: template.effect,
        createdBy: 'system',
      })
    )
  );
};

const stateConflict = (details: Record<string, string>): never => {
  throw new DomainError({
    code: 'STATE_CONFLICT',
    status: 409,
    message: 'Unable to apply like transition',
    details,
  });
};

export type CreateLikeInput = {
  currentUserId: string;
  toId: string;
  agreements: [true, true, true];
  answers: [string, string];
};

export type RespondToLikeInput = {
  currentUserId: string;
  likeId: string;
  agreements: [true, true, true];
  answers: [string, string];
};

export type DecideLikeInput = {
  currentUserId: string;
  likeId: string;
};

export const matchService = {
  async createLike(input: CreateLikeInput): Promise<{ id: string; matchScore: number }> {
    await connectToDatabase();

    const transition = matchTransition(
      {
        fromId: input.currentUserId,
        toId: input.toId,
        status: 'draft',
      },
      { type: 'CREATE' },
      {
        currentUserId: input.currentUserId,
        role: 'from',
      }
    );

    const initiator = await User.findOne({ id: input.currentUserId }).lean<UserType | null>();
    const fromCardSnapshot = buildInitiatorSnapshot(initiator);

    if (!fromCardSnapshot) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Initiator card snapshot is missing',
        details: {
          reason: 'initiator_card_snapshot_missing',
        },
      });
    }

    const matchScore = Math.max(0, Math.min(100, 75));
    const like = await Like.create({
      fromId: input.currentUserId,
      toId: input.toId,
      matchScore,
      fromCardSnapshot,
      status: transition.next.status,
    });

    return {
      id: String(like._id),
      matchScore,
    };
  },

  async respondToLike(input: RespondToLikeInput): Promise<{ status: LikeType['status'] }> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const initiator = await User.findOne({ id: like.fromId }).lean<UserType | null>();
    const initiatorCardSnapshot =
      buildInitiatorSnapshot(initiator) ?? like.fromCardSnapshot;

    if (!initiatorCardSnapshot) {
      throw new DomainError({
        code: 'STATE_CONFLICT',
        status: 409,
        message: 'Initiator card snapshot is missing',
        details: {
          reason: 'initiator_card_snapshot_missing',
        },
      });
    }

    const now = new Date();
    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientResponse: like.recipientResponse,
      },
      {
        type: 'RESPOND',
        response: {
          agreements: [true, true, true],
          answers: [
            sanitize(input.answers[0], 280),
            sanitize(input.answers[1], 280),
          ],
          initiatorCardSnapshot,
          at: now,
        },
      },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    const updated = await Like.findOneAndUpdate(
      {
        _id: like._id,
        toId: input.currentUserId,
        status: { $in: ['sent', 'viewed'] },
      },
      {
        $set: {
          recipientResponse: transition.next.recipientResponse,
          status: transition.next.status,
          updatedAt: transition.next.updatedAt,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) {
      return stateConflict({
        likeId: input.likeId,
        action: 'RESPOND',
      });
    }

    return { status: updated.status };
  },

  async acceptLike(input: DecideLikeInput): Promise<Record<string, never>> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const now = new Date();
    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientResponse: like.recipientResponse,
      },
      { type: 'ACCEPT', at: now },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    const updated = await Like.findOneAndUpdate(
      {
        _id: like._id,
        fromId: input.currentUserId,
        status: 'awaiting_initiator',
      },
      {
        $set: {
          initiatorDecision: transition.next.initiatorDecision,
          status: transition.next.status,
          updatedAt: transition.next.updatedAt,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) {
      return stateConflict({
        likeId: input.likeId,
        action: 'ACCEPT',
      });
    }

    return {};
  },

  async rejectLike(input: DecideLikeInput): Promise<{ already?: true }> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const now = new Date();
    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientDecision: like.recipientDecision,
      },
      { type: 'REJECT', at: now },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    if (like.status === 'rejected') {
      return { already: true };
    }

    const updated = await Like.findOneAndUpdate(
      {
        _id: like._id,
        toId: input.currentUserId,
        status: { $in: ['sent', 'viewed'] },
      },
      {
        $set: {
          recipientDecision: transition.next.recipientDecision,
          status: transition.next.status,
          updatedAt: transition.next.updatedAt,
        },
      },
      { new: true }
    ).lean<LikeType | null>();

    if (!updated) {
      return stateConflict({
        likeId: input.likeId,
        action: 'REJECT',
      });
    }

    return {};
  },

  async confirmLike(input: DecideLikeInput): Promise<{ pairId: string; members: [string, string] }> {
    const { like, role } = await ensureLikeParticipant(input.likeId, input.currentUserId);

    const transition = matchTransition(
      {
        fromId: like.fromId,
        toId: like.toId,
        status: like.status,
        recipientResponse: like.recipientResponse,
      },
      { type: 'CONFIRM' },
      {
        currentUserId: input.currentUserId,
        role,
      }
    );

    const [fromUser, toUser] = await Promise.all([
      User.findOne({ id: like.fromId }).lean<UserType | null>(),
      User.findOne({ id: like.toId }).lean<UserType | null>(),
    ]);

    if (!fromUser || !toUser) {
      throw new DomainError({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Pair users are missing',
      });
    }

    const members = [fromUser.id, toUser.id].sort() as [string, string];
    const key = `${members[0]}|${members[1]}`;

    const pair = await Pair.findOneAndUpdate(
      { key },
      {
        $setOnInsert: {
          key,
          members,
          progress: { streak: 0, completed: 0 },
        },
        $set: { status: 'active' },
      },
      { new: true, upsert: true }
    );

    const requiresPassport =
      !pair.passport ||
      !Array.isArray(pair.passport.riskZones) ||
      pair.passport.riskZones.length === 0;

    if (requiresPassport) {
      pair.passport = buildPassport(fromUser, toUser);
      await pair.save();
    }

    const confirmed = await Like.updateOne(
      {
        _id: like._id,
        status: 'mutual_ready',
      },
      {
        $set: {
          status: transition.next.status,
          updatedAt: transition.next.updatedAt ?? new Date(),
        },
      }
    );

    if (confirmed.modifiedCount !== 1) {
      return stateConflict({
        likeId: input.likeId,
        action: 'CONFIRM',
      });
    }

    await Like.updateMany(
      {
        _id: { $ne: like._id },
        $or: [
          { fromId: like.fromId, toId: like.toId },
          { fromId: like.toId, toId: like.fromId },
        ],
        status: {
          $in: ['sent', 'viewed', 'awaiting_initiator', 'mutual_ready'],
        },
      },
      { $set: { status: 'expired' } }
    );

    await User.updateMany(
      { id: { $in: members } },
      { $set: { 'personal.relationshipStatus': 'in_relationship' } }
    );

    await seedSuggestionsForPair(pair._id as Types.ObjectId);

    return {
      pairId: String(pair._id),
      members,
    };
  },
};
