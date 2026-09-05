import { loadMatchingPeople, mutualMatchingGenderEligible } from "../matchingEligibility.service";
import type { MatchingSocialCard } from "@/domain/model/matching/socialContract";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { DomainError } from "@/domain/errors";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { Like } from "@/models/Like";
import { MatchingBlock } from "@/models/MatchingBlock";
import { MatchingConnection } from "@/models/MatchingConnection";
import { MatchingProfile } from "@/models/MatchingProfile";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import type {
  CandidateGrantReservation,
  CandidateGrantReservationInput,
  CandidateGrantValidationPort,
} from "./ports";

const tokenHash = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

const grantUnavailable = (): never => {
  throw new DomainError({
    code: "CANDIDATE_GRANT_UNAVAILABLE",
    status: 409,
    message: "Candidate presentation is no longer available",
  });
};

const sameText = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const samePublicCard = (
  stored: MatchingSocialCard,
  snapshot: CandidateGrantReservationInput["targetCardSnapshot"],
): boolean =>
  sameText(stored.requirements, snapshot.requirements) &&
  sameText(stored.give ?? [], snapshot.give) &&
  sameText(stored.questions, snapshot.questions) &&
  sameText(stored.boundaries ?? [], snapshot.boundaries ?? []) &&
  JSON.stringify(stored.boundaryDealbreakers ?? []) === JSON.stringify(snapshot.boundaryDealbreakers ?? []) &&
  (stored.cardVersion ?? 1) === (snapshot.cardVersion ?? 1);

type DiscoveryProjection = {
  userId: string;
  age: number;
  location: { type: "Point"; coordinates: [number, number] };
  publicCardRevision: number;
  actualProfileRevision: number;
  preferenceRevision: number;
};

const distanceKm = (
  left: readonly [number, number],
  right: readonly [number, number],
): number => {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

export const mongoCandidateGrantValidationPort: CandidateGrantValidationPort = {
  async reserveForLike(
    input: CandidateGrantReservationInput,
  ): Promise<CandidateGrantReservation> {
    if (!Types.ObjectId.isValid(input.likeId) || input.token.length === 0) {
      return grantUnavailable();
    }
    if (input.requesterId === input.candidateId) return grantUnavailable();

    const profiles = await MatchingProfile.find({
      userId: { $in: [input.requesterId, input.candidateId] },
      active: true,
      requiredDataReady: true,
    })
      .select({
        userId: 1,
        card: 1,
        publicCardRevision: 1,
        actualProfileRevision: 1,
        preferenceRevision: 1,
        registryVersion: 1,
        algorithmVersion: 1,
        desiredAgeRange: 1,
        maxDistanceKm: 1,
        soughtGender: 1,
      })
      .session(input.session)
      .lean<
        Array<{
          userId: string;
          card: MatchingSocialCard;
          soughtGender?: "ANY" | "male" | "female";
          publicCardRevision: number;
          actualProfileRevision: number;
          preferenceRevision: number;
          registryVersion: number;
          algorithmVersion: number;
          desiredAgeRange: { min: number; max: number };
          maxDistanceKm: number;
        }>
      >();
    const byUserId = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );
    const senderProfile = byUserId.get(input.requesterId);
    const targetProfile = byUserId.get(input.candidateId);
    if (
      !senderProfile ||
      !targetProfile ||
      senderProfile.publicCardRevision !== input.senderCardRevision ||
      targetProfile.publicCardRevision !== input.targetCardRevision ||
      senderProfile.registryVersion !== targetProfile.registryVersion ||
      senderProfile.algorithmVersion !== targetProfile.algorithmVersion ||
      !samePublicCard(senderProfile.card, input.senderCardSnapshot) ||
      !samePublicCard(targetProfile.card, input.targetCardSnapshot)
    ) {
      return grantUnavailable();
    }

    const projections = await CandidateDiscoveryProjection.find({
      userId: { $in: [input.requesterId, input.candidateId] },
      active: true,
      requiredDataReady: true,
      location: { $exists: true },
    })
      .select({
        userId: 1,
        age: 1,
        location: 1,
        publicCardRevision: 1,
        actualProfileRevision: 1,
        preferenceRevision: 1,
      })
      .session(input.session)
      .lean<DiscoveryProjection[]>();
    const projectionById = new Map(
      projections.map((projection) => [projection.userId, projection]),
    );
    const requesterProjection = projectionById.get(input.requesterId);
    const candidateProjection = projectionById.get(input.candidateId);
    if (
      !requesterProjection ||
      !candidateProjection ||
      requesterProjection.publicCardRevision !==
        senderProfile.publicCardRevision ||
      candidateProjection.publicCardRevision !==
        targetProfile.publicCardRevision ||
      requesterProjection.actualProfileRevision !==
        senderProfile.actualProfileRevision ||
      candidateProjection.actualProfileRevision !==
        targetProfile.actualProfileRevision ||
      requesterProjection.preferenceRevision !==
        senderProfile.preferenceRevision ||
      candidateProjection.preferenceRevision !==
        targetProfile.preferenceRevision ||
      candidateProjection.age < senderProfile.desiredAgeRange.min ||
      candidateProjection.age > senderProfile.desiredAgeRange.max ||
      requesterProjection.age < targetProfile.desiredAgeRange.min ||
      requesterProjection.age > targetProfile.desiredAgeRange.max
    ) {
      return grantUnavailable();
    }
    const separationKm = distanceKm(
      requesterProjection.location.coordinates,
      candidateProjection.location.coordinates,
    );
    if (
      separationKm > senderProfile.maxDistanceKm ||
      separationKm > targetProfile.maxDistanceKm
    ) {
      return grantUnavailable();
    }

    const people = await loadMatchingPeople([input.requesterId, input.candidateId], input.session);
    if (!mutualMatchingGenderEligible(people.get(input.requesterId), people.get(input.candidateId), senderProfile, targetProfile)) return grantUnavailable();

    const participantKey = [input.requesterId, input.candidateId]
      .sort()
      .join("|");
    const activeBlock = await MatchingBlock.exists({
      participantKey,
      status: "ACTIVE",
    }).session(input.session);
    if (activeBlock) return grantUnavailable();

    const occupiedMembership = await PairMembershipClaim.exists({
      userId: { $in: [input.requesterId, input.candidateId] },
    }).session(input.session);
    if (occupiedMembership) return grantUnavailable();

    const activeConnection = await MatchingConnection.exists({
      participantKey,
      status: { $in: ["ACTIVE", "PAUSED"] },
    }).session(input.session);
    if (activeConnection) return grantUnavailable();

    const activeInteraction = await Like.exists({
      $or: [
        { fromId: input.requesterId, toId: input.candidateId },
        { fromId: input.candidateId, toId: input.requesterId },
      ],
      status: { $in: ["SENT", "VIEWED", "RESPONDED", "MATCHED"] },
    }).session(input.session);
    if (activeInteraction) return grantUnavailable();

    const declineCooldown = await Like.exists({
      $or: [
        { fromId: input.requesterId, toId: input.candidateId },
        { fromId: input.candidateId, toId: input.requesterId },
      ],
      status: "DECLINED",
      declinedUntil: { $gt: input.now },
    }).session(input.session);
    if (declineCooldown) return grantUnavailable();

    const likeObjectId = new Types.ObjectId(input.likeId);
    const grant = await CandidatePresentationGrant.findOneAndUpdate(
      {
        tokenHash: tokenHash(input.token),
        requesterId: input.requesterId,
        candidateId: input.candidateId,
        requesterCardRevision: input.senderCardRevision,
        candidateCardRevision: input.targetCardRevision,
        requesterProfileRevision: senderProfile.actualProfileRevision,
        candidateProfileRevision: targetProfile.actualProfileRevision,
        requesterPreferenceRevision: senderProfile.preferenceRevision,
        candidatePreferenceRevision: targetProfile.preferenceRevision,
        registryVersion: senderProfile.registryVersion,
        algorithmVersion: senderProfile.algorithmVersion,
        expiresAt: { $gt: input.now },
        revokedAt: { $exists: false },
        $or: [
          { usedByLikeId: { $exists: false } },
          { usedByLikeId: likeObjectId },
        ],
      },
      { $set: { usedByLikeId: likeObjectId } },
      { new: true, session: input.session },
    )
      .select({ _id: 1 })
      .lean<{ _id: Types.ObjectId } | null>();

    if (!grant) return grantUnavailable();
    return { grantId: String(grant._id) };
  },
};
