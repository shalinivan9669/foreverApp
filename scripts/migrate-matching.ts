import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose, { Types } from "mongoose";
import { MVP_FACTOR_REGISTRY } from "@/domain/model/definitions/mvpDefinitions";
import { CandidateDiscoveryProjection } from "@/models/CandidateDiscoveryProjection";
import { CandidatePresentationGrant } from "@/models/CandidatePresentationGrant";
import { Like } from "@/models/Like";
import { MatchingBlock } from "@/models/MatchingBlock";
import { MatchingConnection } from "@/models/MatchingConnection";
import { MatchingEvaluationSnapshot } from "@/models/MatchingEvaluationSnapshot";
import { MatchingFeedSession } from "@/models/MatchingFeedSession";
import { MatchingProfile } from "@/models/MatchingProfile";
import { MatchingSocialEffect } from "@/models/MatchingSocialEffect";
import { MatchingUseGrant } from "@/models/MatchingUseGrant";
import { PairMembershipClaim } from "@/models/PairMembershipClaim";
import { PartnerPreferenceProfile } from "@/models/PartnerPreferenceProfile";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

type MigrationMode = "DRY_RUN" | "APPLY_ADDITIVE" | "VERIFY";

type LegacyUserRow = {
  _id: Types.ObjectId;
  id?: string;
  personal?: { age?: number; city?: string };
  preferences?: {
    desiredAgeRange?: { min?: number; max?: number };
    maxDistanceKm?: number;
  };
  profile?: {
    matchCard?: {
      requirements?: string[];
      give?: string[];
      questions?: string[];
      isActive?: boolean;
      updatedAt?: Date;
    };
  };
  location?: { type?: string; coordinates?: number[] };
};

type LegacyLikeRow = {
  _id: Types.ObjectId;
  fromId?: string;
  toId?: string;
  status?: string;
  legacyStatus?: string;
  revision?: number;
  interactionKey?: string;
  connectionId?: Types.ObjectId;
  declinedUntil?: Date;
  fromCardSnapshot?: LegacyCardSnapshotRow;
  targetCardSnapshot?: LegacyCardSnapshotRow;
  recipientResponse?: {
    agreements?: boolean[];
    answers?: string[];
    initiatorCardSnapshot?: LegacyCardSnapshotRow;
    at?: Date;
  };
  initiatorDecision?: { accepted?: boolean; at?: Date };
  agreements?: boolean[];
  answers?: string[];
  cardSnapshot?: LegacyCardSnapshotRow;
  migrationVersion?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type LegacyCardSnapshotRow = {
  requirements?: string[];
  give?: string[];
  questions?: string[];
  updatedAt?: Date;
};

type PairRow = {
  _id: Types.ObjectId;
  key: string;
  members: string[];
  status: "active" | "paused";
};

type ConnectionRow = {
  _id: Types.ObjectId;
  participantIds: string[];
  participantKey: string;
  sourceLikeIds?: string[];
  stage?: string;
  status?: string;
  coupleConfirmation?: {
    requestedBy?: string;
    requestedAt?: Date;
    confirmedBy?: string[];
    revision?: number;
  };
  pairId?: Types.ObjectId;
  revision?: number;
  runId?: string;
  migrationVersion?: string;
};

type TargetProfileRow = {
  _id: Types.ObjectId;
  userId: string;
  /** Legacy duplicate removed by this additive migration; snapshots are canonical. */
  actual?: object;
  card?: { requirements?: string[]; give?: string[]; questions?: string[] };
  discoveryRequested?: boolean;
  active?: boolean;
  requiredDataReady?: boolean;
  desiredAgeRange?: { min?: number; max?: number };
  maxDistanceKm?: number;
  city?: string;
  publicCardRevision?: number;
  actualProfileRevision?: number;
  preferenceRevision?: number;
  registryVersion?: number;
  algorithmVersion?: number;
  projectionHash?: string;
  runId?: string;
};

type TargetProjectionRow = {
  _id: Types.ObjectId;
  userId: string;
  active?: boolean;
  requiredDataReady?: boolean;
  age?: number;
  city?: string;
  location?: { type?: string; coordinates?: number[] };
  relationshipIntent?: string;
  publicCardRevision?: number;
  actualProfileRevision?: number;
  preferenceRevision?: number;
  registryVersion?: number;
  algorithmVersion?: number;
  projectionHash?: string;
};

type GeoPoint = { type: "Point"; coordinates: [number, number] };
type Card = {
  requirements: [string, string, string];
  give: [string, string, string];
  questions: [string, string];
};

type SafeCardSnapshot = Card & { updatedAt?: Date };
type CanonicalLikeStatus = (typeof CANONICAL_STATUSES)[number];
type LikePayloadPatch = {
  fromCardSnapshot?: SafeCardSnapshot;
  recipientResponse?: {
    agreements: [true, true, true];
    answers: [string, string];
    initiatorCardSnapshot: SafeCardSnapshot;
    at: Date;
  };
  initiatorDecision?: { accepted: true; at: Date };
};
type LikePayloadPlan =
  | { ok: true; patch: LikePayloadPatch }
  | { ok: false; patch: Record<string, never> };

type ExpectedProfile = {
  userId: string;
  card: Card;
  discoveryRequested: boolean;
  active: boolean;
  requiredDataReady: boolean;
  desiredAgeRange: { min: number; max: number };
  maxDistanceKm: number;
  city: string;
  publicCardRevision: number;
  actualProfileRevision: number;
  preferenceRevision: number;
  registryVersion: number;
  algorithmVersion: number;
  projectionHash: string;
};

type ExpectedProjection = {
  userId: string;
  active: boolean;
  requiredDataReady: boolean;
  age: number;
  city: string;
  relationshipIntent: "SEEKING_RELATIONSHIP";
  publicCardRevision: number;
  actualProfileRevision: number;
  preferenceRevision: number;
  registryVersion: number;
  algorithmVersion: number;
  projectionHash: string;
  location?: GeoPoint;
};

type Findings = {
  duplicateSourceUserIds: number;
  malformedCards: number;
  malformedDemographics: number;
  invalidLocations: number;
  unknownLikeStates: number;
  malformedLikes: number;
  missingLikeParticipants: number;
  duplicateActiveLikeGroups: number;
  pairedWithoutVerifiedPair: number;
  matchedParticipantsAlreadyPaired: number;
  matchedParticipantsBlocked: number;
  targetProfileConflicts: number;
  targetProjectionConflicts: number;
  targetConnectionConflicts: number;
  targetLikeConnectionConflicts: number;
  likePayloadConflicts: number;
  orphanTargetProfiles: number;
  orphanTargetProjections: number;
  orphanTargetConnections: number;
  unknownConnectionStates: number;
  duplicateUniqueIndexGroups: number;
  extraIndexes: number;
};

type Counts = {
  sourceCards: number;
  sourceLikes: number;
  targetProfiles: number;
  targetProjections: number;
  targetConnections: number;
  targetMigratedLikes: number;
  pendingProfiles: number;
  pendingProjections: number;
  pendingLikeMappings: number;
  pendingLikePayloadBackfills: number;
  pendingLikeConnectionLinks: number;
  pendingConnections: number;
  pendingConnectionNormalizations: number;
  pendingActualProfileRemovals: number;
  runtimeOwnedProfiles: number;
  missingIndexes: number;
};

type ScanReport = { findings: Findings; counts: Counts };

const LEGACY_STATUS_MAPPING = new Map<string, string>([
  ["sent", "SENT"],
  ["viewed", "VIEWED"],
  ["awaiting_initiator", "RESPONDED"],
  ["mutual_ready", "MATCHED"],
  ["paired", "MATCHED"],
  ["rejected", "DECLINED"],
  ["expired", "EXPIRED"],
]);
const CANONICAL_STATUSES = [
  "SENT",
  "VIEWED",
  "RESPONDED",
  "MATCHED",
  "DECLINED",
  "EXPIRED",
  "BLOCKED",
] as const;
const ACCEPTED_STATUSES = [
  ...LEGACY_STATUS_MAPPING.keys(),
  ...CANONICAL_STATUSES,
];
const ACTIVE_SOURCE_STATUSES = [
  "sent",
  "viewed",
  "awaiting_initiator",
  "mutual_ready",
  "paired",
  "SENT",
  "VIEWED",
  "RESPONDED",
  "MATCHED",
];
const MATCHING_MIGRATION_VERSION = "matching-additive-v1";
const DEFAULT_BATCH_SIZE = 200;
const DECLINE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;

const indexTargets = [
  Like,
  MatchingProfile,
  PartnerPreferenceProfile,
  MatchingUseGrant,
  CandidateDiscoveryProjection,
  CandidatePresentationGrant,
  MatchingEvaluationSnapshot,
  MatchingConnection,
  MatchingBlock,
  MatchingFeedSession,
  MatchingSocialEffect,
  PairMembershipClaim,
] as const;

const emptyFindings = (): Findings => ({
  duplicateSourceUserIds: 0,
  malformedCards: 0,
  malformedDemographics: 0,
  invalidLocations: 0,
  unknownLikeStates: 0,
  malformedLikes: 0,
  missingLikeParticipants: 0,
  duplicateActiveLikeGroups: 0,
  pairedWithoutVerifiedPair: 0,
  matchedParticipantsAlreadyPaired: 0,
  matchedParticipantsBlocked: 0,
  targetProfileConflicts: 0,
  targetProjectionConflicts: 0,
  targetConnectionConflicts: 0,
  targetLikeConnectionConflicts: 0,
  likePayloadConflicts: 0,
  orphanTargetProfiles: 0,
  orphanTargetProjections: 0,
  orphanTargetConnections: 0,
  unknownConnectionStates: 0,
  duplicateUniqueIndexGroups: 0,
  extraIndexes: 0,
});

const emptyCounts = (): Counts => ({
  sourceCards: 0,
  sourceLikes: 0,
  targetProfiles: 0,
  targetProjections: 0,
  targetConnections: 0,
  targetMigratedLikes: 0,
  pendingProfiles: 0,
  pendingProjections: 0,
  pendingLikeMappings: 0,
  pendingLikePayloadBackfills: 0,
  pendingLikeConnectionLinks: 0,
  pendingConnections: 0,
  pendingConnectionNormalizations: 0,
  pendingActualProfileRemovals: 0,
  runtimeOwnedProfiles: 0,
  missingIndexes: 0,
});

const mergeReport = (target: ScanReport, source: ScanReport): void => {
  for (const key of Object.keys(target.findings) as Array<keyof Findings>) {
    target.findings[key] += source.findings[key];
  }
  for (const key of Object.keys(target.counts) as Array<keyof Counts>) {
    target.counts[key] += source.counts[key];
  }
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const deterministicConnectionId = (participantKey: string): Types.ObjectId =>
  new Types.ObjectId(
    sha256(`${MATCHING_MIGRATION_VERSION}:connection:${participantKey}`).slice(
      0,
      24,
    ),
  );

const readMode = (): MigrationMode => {
  const value =
    process.argv.find((argument) => argument.startsWith("--mode="))?.slice(7) ??
    "DRY_RUN";
  if (value !== "DRY_RUN" && value !== "APPLY_ADDITIVE" && value !== "VERIFY") {
    throw new Error("MATCHING_MIGRATION_MODE_INVALID");
  }
  return value;
};

const readBatchSize = (): number => {
  const raw =
    process.argv
      .find((argument) => argument.startsWith("--batch-size="))
      ?.slice(13) ?? String(DEFAULT_BATCH_SIZE);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 1_000) {
    throw new Error("MATCHING_MIGRATION_BATCH_SIZE_INVALID");
  }
  return value;
};

const canonicalParticipantIds = (
  left: string,
  right: string,
): [string, string] => [left, right].sort() as [string, string];

const exactStringArray = (
  value: string[] | undefined,
  length: number,
  maximum: number,
): string[] | null => {
  if (!Array.isArray(value) || value.length !== length) return null;
  if (
    value.some(
      (item) =>
        typeof item !== "string" ||
        item.trim().length === 0 ||
        item.trim().length > maximum,
    )
  ) {
    return null;
  }
  return [...value];
};

const parseLocation = (
  value: LegacyUserRow["location"],
):
  | { kind: "MISSING" }
  | { kind: "INVALID" }
  | { kind: "VALID"; value: GeoPoint } => {
  if (value === undefined) return { kind: "MISSING" };
  const coordinates = value.coordinates;
  if (
    value.type !== "Point" ||
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1]) ||
    Number(coordinates[0]) < -180 ||
    Number(coordinates[0]) > 180 ||
    Number(coordinates[1]) < -90 ||
    Number(coordinates[1]) > 90
  ) {
    return { kind: "INVALID" };
  }
  return {
    kind: "VALID",
    value: {
      type: "Point",
      coordinates: [Number(coordinates[0]), Number(coordinates[1])],
    },
  };
};

const sameJson = (
  left: object | undefined,
  right: object | undefined,
): boolean => JSON.stringify(left) === JSON.stringify(right);

const validDate = (value: Date | undefined): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const safeCardSnapshot = (
  value: LegacyCardSnapshotRow | undefined,
): SafeCardSnapshot | null => {
  if (!value) return null;
  const requirements = exactStringArray(value.requirements, 3, 80);
  const give = exactStringArray(value.give, 3, 80);
  const questions = exactStringArray(value.questions, 2, 120);
  if (!requirements || !give || !questions) return null;
  if (value.updatedAt !== undefined && !validDate(value.updatedAt)) return null;
  return {
    requirements: requirements as [string, string, string],
    give: give as [string, string, string],
    questions: questions as [string, string],
    ...(value.updatedAt ? { updatedAt: value.updatedAt } : {}),
  };
};

const safeAgreements = (
  value: boolean[] | undefined,
): [true, true, true] | null =>
  Array.isArray(value) &&
  value.length === 3 &&
  value[0] === true &&
  value[1] === true &&
  value[2] === true
    ? [true, true, true]
    : null;

const safeAnswers = (value: string[] | undefined): [string, string] | null => {
  const answers = exactStringArray(value, 2, 280);
  return answers ? (answers as [string, string]) : null;
};

const canonicalLikeStatus = (status: string): CanonicalLikeStatus | null => {
  const mapped = LEGACY_STATUS_MAPPING.get(status);
  if (mapped) return mapped as CanonicalLikeStatus;
  return CANONICAL_STATUSES.includes(status as CanonicalLikeStatus)
    ? (status as CanonicalLikeStatus)
    : null;
};

const planLikePayload = (
  row: LegacyLikeRow & { status: string },
): LikePayloadPlan => {
  const canonicalStatus = canonicalLikeStatus(row.status);
  if (!canonicalStatus) return { ok: false, patch: {} };
  const originalStatus = row.legacyStatus ?? row.status;
  const patch: LikePayloadPatch = {};
  const directSenderSnapshot = safeCardSnapshot(row.fromCardSnapshot);
  if (row.fromCardSnapshot !== undefined && !directSenderSnapshot) {
    return { ok: false, patch: {} };
  }
  const legacySenderSnapshot = safeCardSnapshot(row.cardSnapshot);
  if (row.cardSnapshot !== undefined && !legacySenderSnapshot) {
    return { ok: false, patch: {} };
  }
  if (
    directSenderSnapshot &&
    legacySenderSnapshot &&
    !sameJson(directSenderSnapshot, legacySenderSnapshot)
  ) {
    return { ok: false, patch: {} };
  }
  const senderSnapshot = directSenderSnapshot ?? legacySenderSnapshot;
  const snapshotRequired =
    canonicalStatus === "SENT" ||
    canonicalStatus === "VIEWED" ||
    canonicalStatus === "RESPONDED" ||
    canonicalStatus === "MATCHED";
  if (snapshotRequired && !senderSnapshot) return { ok: false, patch: {} };
  if (!directSenderSnapshot && legacySenderSnapshot) {
    patch.fromCardSnapshot = legacySenderSnapshot;
  }

  const targetSnapshot = safeCardSnapshot(row.targetCardSnapshot);
  if (row.targetCardSnapshot !== undefined && !targetSnapshot) {
    return { ok: false, patch: {} };
  }
  if (
    (canonicalStatus === "RESPONDED" || canonicalStatus === "MATCHED") &&
    !targetSnapshot
  ) {
    // There is no safe historical source for the recipient's card. Never copy
    // the current User card into an immutable historical interaction.
    return { ok: false, patch: {} };
  }

  if (canonicalStatus !== "RESPONDED" && canonicalStatus !== "MATCHED") {
    return { ok: true, patch };
  }
  if (!senderSnapshot) return { ok: false, patch: {} };
  if (row.recipientResponse) {
    const agreements = safeAgreements(row.recipientResponse.agreements);
    const answers = safeAnswers(row.recipientResponse.answers);
    const responseSnapshot = safeCardSnapshot(
      row.recipientResponse.initiatorCardSnapshot,
    );
    if (
      !agreements ||
      !answers ||
      !responseSnapshot ||
      !sameJson(responseSnapshot, senderSnapshot) ||
      !validDate(row.recipientResponse.at)
    ) {
      return { ok: false, patch: {} };
    }
  } else {
    const canBackfillLegacyResponse =
      originalStatus === "awaiting_initiator" ||
      originalStatus === "mutual_ready" ||
      originalStatus === "paired";
    const agreements = safeAgreements(row.agreements);
    const answers = safeAnswers(row.answers);
    const at = validDate(row.updatedAt)
      ? row.updatedAt
      : validDate(row.createdAt)
        ? row.createdAt
        : undefined;
    if (!canBackfillLegacyResponse || !agreements || !answers || !at) {
      return { ok: false, patch: {} };
    }
    patch.recipientResponse = {
      agreements,
      answers,
      initiatorCardSnapshot: senderSnapshot,
      at,
    };
  }

  if (canonicalStatus === "MATCHED") {
    if (row.initiatorDecision) {
      if (
        row.initiatorDecision.accepted !== true ||
        !validDate(row.initiatorDecision.at)
      ) {
        return { ok: false, patch: {} };
      }
    } else {
      const canBackfillLegacyDecision =
        originalStatus === "mutual_ready" || originalStatus === "paired";
      const at = validDate(row.updatedAt)
        ? row.updatedAt
        : validDate(row.createdAt)
          ? row.createdAt
          : undefined;
      if (!canBackfillLegacyDecision || !at) {
        return { ok: false, patch: {} };
      }
      patch.initiatorDecision = { accepted: true, at };
    }
  }
  return { ok: true, patch };
};

const expectedFromUser = (
  row: LegacyUserRow,
  findings: Findings,
): {
  profile: ExpectedProfile;
  projection: ExpectedProjection;
  sourceUpdatedAt?: Date;
} | null => {
  const userId = typeof row.id === "string" ? row.id.trim() : "";
  const card = row.profile?.matchCard;
  const requirements = exactStringArray(card?.requirements, 3, 80);
  const give = exactStringArray(card?.give, 3, 80);
  const questions = exactStringArray(card?.questions, 2, 120);
  if (
    !userId ||
    !card ||
    typeof card.isActive !== "boolean" ||
    !requirements ||
    !give ||
    !questions
  ) {
    findings.malformedCards += 1;
    return null;
  }
  const age = row.personal?.age;
  const city =
    typeof row.personal?.city === "string" ? row.personal.city.trim() : "";
  const minimumAge = row.preferences?.desiredAgeRange?.min;
  const maximumAge = row.preferences?.desiredAgeRange?.max;
  const maxDistanceKm = row.preferences?.maxDistanceKm;
  if (
    !Number.isInteger(age) ||
    Number(age) < 18 ||
    Number(age) > 120 ||
    !city ||
    city.length > 120 ||
    !Number.isInteger(minimumAge) ||
    !Number.isInteger(maximumAge) ||
    Number(minimumAge) < 18 ||
    Number(maximumAge) > 120 ||
    Number(minimumAge) > Number(maximumAge) ||
    !Number.isFinite(maxDistanceKm) ||
    Number(maxDistanceKm) < 1 ||
    Number(maxDistanceKm) > 20_000
  ) {
    findings.malformedDemographics += 1;
    return null;
  }
  const location = parseLocation(row.location);
  if (
    location.kind === "INVALID" ||
    (card.isActive && location.kind !== "VALID")
  ) {
    findings.invalidLocations += 1;
    return null;
  }
  const publicCardRevision = 1;
  const actualProfileRevision = 0;
  const preferenceRevision = 0;
  const active = false;
  const requiredDataReady = false;
  const projectionHash = sha256(
    JSON.stringify({
      ownerId: userId,
      publicCardRevision,
      actualProfileRevision,
      preferenceRevision,
      active,
      requiredDataReady,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    }),
  );
  const profile: ExpectedProfile = {
    userId,
    card: {
      requirements: requirements as [string, string, string],
      give: give as [string, string, string],
      questions: questions as [string, string],
    },
    discoveryRequested: card.isActive,
    active,
    requiredDataReady,
    desiredAgeRange: { min: Number(minimumAge), max: Number(maximumAge) },
    maxDistanceKm: Number(maxDistanceKm),
    city,
    publicCardRevision,
    actualProfileRevision,
    preferenceRevision,
    registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
    algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
    projectionHash,
  };
  return {
    profile,
    projection: {
      userId,
      active,
      requiredDataReady,
      age: Number(age),
      city,
      ...(location.kind === "VALID" ? { location: location.value } : {}),
      relationshipIntent: "SEEKING_RELATIONSHIP",
      publicCardRevision,
      actualProfileRevision,
      preferenceRevision,
      registryVersion: MVP_FACTOR_REGISTRY.registryVersion,
      algorithmVersion: MVP_FACTOR_REGISTRY.algorithmVersion,
      projectionHash,
    },
    ...(card.updatedAt instanceof Date
      ? { sourceUpdatedAt: card.updatedAt }
      : {}),
  };
};

const profileMatches = (
  actual: TargetProfileRow,
  expected: ExpectedProfile,
): boolean =>
  actual.userId === expected.userId &&
  sameJson(actual.card, expected.card) &&
  actual.discoveryRequested === expected.discoveryRequested &&
  actual.active === expected.active &&
  actual.requiredDataReady === expected.requiredDataReady &&
  sameJson(actual.desiredAgeRange, expected.desiredAgeRange) &&
  actual.maxDistanceKm === expected.maxDistanceKm &&
  actual.city === expected.city &&
  actual.publicCardRevision === expected.publicCardRevision &&
  actual.actualProfileRevision === expected.actualProfileRevision &&
  actual.preferenceRevision === expected.preferenceRevision &&
  actual.registryVersion === expected.registryVersion &&
  actual.algorithmVersion === expected.algorithmVersion &&
  actual.projectionHash === expected.projectionHash;

const projectionMatches = (
  actual: TargetProjectionRow,
  expected: ExpectedProjection,
): boolean =>
  actual.userId === expected.userId &&
  actual.active === expected.active &&
  actual.requiredDataReady === expected.requiredDataReady &&
  actual.age === expected.age &&
  actual.city === expected.city &&
  sameJson(actual.location, expected.location) &&
  actual.relationshipIntent === expected.relationshipIntent &&
  actual.publicCardRevision === expected.publicCardRevision &&
  actual.actualProfileRevision === expected.actualProfileRevision &&
  actual.preferenceRevision === expected.preferenceRevision &&
  actual.registryVersion === expected.registryVersion &&
  actual.algorithmVersion === expected.algorithmVersion &&
  actual.projectionHash === expected.projectionHash;

const usableRuntimeProfile = (profile: TargetProfileRow): boolean =>
  profile.publicCardRevision !== undefined &&
  profile.publicCardRevision >= 1 &&
  profile.actualProfileRevision !== undefined &&
  profile.actualProfileRevision >= 0 &&
  profile.preferenceRevision !== undefined &&
  profile.preferenceRevision >= 0 &&
  profile.registryVersion === MVP_FACTOR_REGISTRY.registryVersion &&
  profile.algorithmVersion === MVP_FACTOR_REGISTRY.algorithmVersion &&
  typeof profile.active === "boolean" &&
  typeof profile.requiredDataReady === "boolean" &&
  typeof profile.projectionHash === "string" &&
  /^[a-f\d]{64}$/.test(profile.projectionHash);

const runtimeProjection = (
  profile: TargetProfileRow,
  source: ExpectedProjection,
): ExpectedProjection | null => {
  if (!usableRuntimeProfile(profile)) return null;
  if (profile.active && !source.location) return null;
  return {
    userId: profile.userId,
    active: Boolean(profile.active),
    requiredDataReady: Boolean(profile.requiredDataReady),
    age: source.age,
    city: source.city,
    ...(source.location ? { location: source.location } : {}),
    relationshipIntent: "SEEKING_RELATIONSHIP",
    publicCardRevision: Number(profile.publicCardRevision),
    actualProfileRevision: Number(profile.actualProfileRevision),
    preferenceRevision: Number(profile.preferenceRevision),
    registryVersion: Number(profile.registryVersion),
    algorithmVersion: Number(profile.algorithmVersion),
    projectionHash: String(profile.projectionHash),
  };
};

const scanProfiles = async (input: {
  database: mongoose.mongo.Db;
  batchSize: number;
  runId: string;
  apply: boolean;
}): Promise<ScanReport> => {
  const report = { findings: emptyFindings(), counts: emptyCounts() };
  const users = input.database.collection<LegacyUserRow>("users");
  const profiles =
    input.database.collection<TargetProfileRow>("matching_profiles");
  const projections = input.database.collection<TargetProjectionRow>(
    "candidate_discovery_projections",
  );
  report.counts.pendingActualProfileRemovals = await profiles.countDocuments({
    actual: { $exists: true },
  });
  if (input.apply && report.counts.pendingActualProfileRemovals > 0) {
    await profiles.updateMany(
      { actual: { $exists: true } },
      { $unset: { actual: "" } },
    );
  }
  let after: Types.ObjectId | undefined;
  for (;;) {
    const rows = await users
      .find({
        "profile.matchCard": { $exists: true },
        ...(after ? { _id: { $gt: after } } : {}),
      })
      .project<LegacyUserRow>({
        id: 1,
        personal: 1,
        preferences: 1,
        profile: 1,
        location: 1,
      })
      .sort({ _id: 1 })
      .limit(input.batchSize)
      .toArray();
    if (rows.length === 0) break;
    after = rows[rows.length - 1]?._id;
    const valid = rows
      .map((row) => ({ row, expected: expectedFromUser(row, report.findings) }))
      .filter(
        (
          item,
        ): item is {
          row: LegacyUserRow;
          expected: NonNullable<ReturnType<typeof expectedFromUser>>;
        } => item.expected !== null,
      );
    report.counts.sourceCards += rows.length;
    const userIds = valid.map((item) => item.expected.profile.userId);
    const [profileRows, projectionRows] = await Promise.all([
      profiles
        .find({ userId: { $in: userIds } })
        .limit(Math.max(1, userIds.length * 2 + 1))
        .toArray(),
      projections
        .find({ userId: { $in: userIds } })
        .limit(Math.max(1, userIds.length * 2 + 1))
        .toArray(),
    ]);
    const profileByUser = new Map(profileRows.map((row) => [row.userId, row]));
    const projectionByUser = new Map(
      projectionRows.map((row) => [row.userId, row]),
    );
    if (profileRows.length > userIds.length)
      report.findings.targetProfileConflicts += 1;
    if (projectionRows.length > userIds.length) {
      report.findings.targetProjectionConflicts += 1;
    }
    for (const item of valid) {
      const expected = item.expected.profile;
      const existingProfile = profileByUser.get(expected.userId);
      const pristineMigrationProfile = Boolean(
        existingProfile?.runId &&
        existingProfile.publicCardRevision === 1 &&
        existingProfile.actualProfileRevision === 0 &&
        existingProfile.preferenceRevision === 0,
      );
      let effectiveProjection = item.expected.projection;
      if (!existingProfile || pristineMigrationProfile) {
        if (!existingProfile || !profileMatches(existingProfile, expected)) {
          report.counts.pendingProfiles += 1;
        }
        if (input.apply) {
          if (!existingProfile) {
            await profiles.updateOne(
              { userId: expected.userId },
              {
                $setOnInsert: {
                  ...expected,
                  runId: input.runId,
                  migrationVersion: MATCHING_MIGRATION_VERSION,
                  createdAt: new Date(),
                  updatedAt: item.expected.sourceUpdatedAt ?? new Date(),
                },
              },
              { upsert: true },
            );
          } else if (!profileMatches(existingProfile, expected)) {
            await profiles.updateOne(
              { _id: existingProfile._id },
              {
                $set: {
                  ...expected,
                  migrationVersion: MATCHING_MIGRATION_VERSION,
                  updatedAt: item.expected.sourceUpdatedAt ?? new Date(),
                },
              },
            );
          }
        }
      } else {
        report.counts.runtimeOwnedProfiles += 1;
        const projected = runtimeProjection(
          existingProfile,
          item.expected.projection,
        );
        if (!projected) {
          report.findings.targetProfileConflicts += 1;
          continue;
        }
        effectiveProjection = projected;
      }
      const existingProjection = projectionByUser.get(expected.userId);
      if (
        !existingProjection ||
        !projectionMatches(existingProjection, effectiveProjection)
      ) {
        report.counts.pendingProjections += 1;
      }
      if (input.apply) {
        await projections.updateOne(
          { userId: expected.userId },
          {
            $set: {
              ...effectiveProjection,
              migrationVersion: MATCHING_MIGRATION_VERSION,
              updatedAt: item.expected.sourceUpdatedAt ?? new Date(),
            },
            $setOnInsert: { runId: input.runId, createdAt: new Date() },
            ...(effectiveProjection.location
              ? {}
              : { $unset: { location: 1 } }),
          },
          { upsert: true },
        );
      }
    }
  }
  return report;
};

type PairGroup = { _id: string; count: number; pair: PairRow };
type MembershipGroup = { _id: string; count: number; pairKey: string };
type ConnectionGroup = {
  _id: string;
  count: number;
  connection: ConnectionRow;
};

const validLikeIdentity = (
  row: LegacyLikeRow,
): row is LegacyLikeRow & { fromId: string; toId: string; status: string } =>
  row._id instanceof Types.ObjectId &&
  typeof row.fromId === "string" &&
  row.fromId.trim().length > 0 &&
  typeof row.toId === "string" &&
  row.toId.trim().length > 0 &&
  row.fromId !== row.toId &&
  typeof row.status === "string" &&
  ACCEPTED_STATUSES.includes(row.status) &&
  (row.legacyStatus === undefined ||
    LEGACY_STATUS_MAPPING.has(row.legacyStatus));

const connectionMatchesLike = (
  connection: ConnectionRow,
  row: LegacyLikeRow & { fromId: string; toId: string },
): boolean => {
  const participants = canonicalParticipantIds(row.fromId, row.toId);
  return (
    connection.status === "ACTIVE" &&
    connection.participantKey === participants.join("|") &&
    sameJson(connection.participantIds, participants) &&
    (connection.sourceLikeIds ?? []).includes(String(row._id))
  );
};

type ConnectionExpectation =
  | { kind: "MATCHED"; participants: [string, string] }
  | {
      kind: "PAIRED";
      participants: [string, string];
      pairId: Types.ObjectId;
    };
type ConnectionDisposition = "VALID" | "NORMALIZE_MIGRATION_OWNED" | "BLOCK";

const validMatchedConfirmation = (
  connection: ConnectionRow,
  participants: [string, string],
): boolean => {
  const confirmation = connection.coupleConfirmation;
  if (
    !confirmation ||
    !Array.isArray(confirmation.confirmedBy) ||
    !Number.isInteger(confirmation.revision) ||
    Number(confirmation.revision) < 0
  ) {
    return false;
  }
  if (!confirmation.requestedBy) {
    return (
      confirmation.requestedAt === undefined &&
      confirmation.confirmedBy.length === 0
    );
  }
  return (
    participants.includes(confirmation.requestedBy) &&
    validDate(confirmation.requestedAt) &&
    confirmation.confirmedBy.length === 1 &&
    confirmation.confirmedBy[0] === confirmation.requestedBy
  );
};

const validPairedConfirmation = (
  connection: ConnectionRow,
  participants: [string, string],
): boolean => {
  const confirmation = connection.coupleConfirmation;
  if (
    !confirmation ||
    !Array.isArray(confirmation.confirmedBy) ||
    !Number.isInteger(confirmation.revision) ||
    Number(confirmation.revision) < 2 ||
    !sameJson([...new Set(confirmation.confirmedBy)].sort(), participants)
  ) {
    return false;
  }
  if (!confirmation.requestedBy) return confirmation.requestedAt === undefined;
  return (
    participants.includes(confirmation.requestedBy) &&
    validDate(confirmation.requestedAt)
  );
};

const pristineMigrationConnection = (
  connection: ConnectionRow,
  expectation: ConnectionExpectation,
): boolean => {
  const expectedId = deterministicConnectionId(
    expectation.participants.join("|"),
  );
  const expectedRevision = expectation.kind === "MATCHED" ? 0 : 2;
  return (
    connection.migrationVersion === MATCHING_MIGRATION_VERSION &&
    typeof connection.runId === "string" &&
    connection.runId.trim().length > 0 &&
    String(connection._id) === String(expectedId) &&
    connection.revision === expectedRevision
  );
};

const connectionDisposition = (
  connection: ConnectionRow,
  expectation: ConnectionExpectation,
): ConnectionDisposition => {
  const { participants } = expectation;
  if (
    connection.status !== "ACTIVE" ||
    !["MATCHED", "TALKING", "DATING", "COUPLE_CONFIRMED"].includes(
      connection.stage ?? "",
    ) ||
    connection.participantKey !== participants.join("|") ||
    !sameJson(connection.participantIds, participants) ||
    !Number.isInteger(connection.revision) ||
    Number(connection.revision) < 0
  ) {
    return "BLOCK";
  }
  const semanticallyValid =
    expectation.kind === "MATCHED"
      ? connection.stage === "MATCHED" &&
        !connection.pairId &&
        validMatchedConfirmation(connection, participants)
      : connection.stage === "COUPLE_CONFIRMED" &&
        Boolean(connection.pairId) &&
        String(connection.pairId) === String(expectation.pairId) &&
        Number(connection.revision) >= 2 &&
        validPairedConfirmation(connection, participants);
  if (semanticallyValid) return "VALID";
  return pristineMigrationConnection(connection, expectation)
    ? "NORMALIZE_MIGRATION_OWNED"
    : "BLOCK";
};

const scanLikes = async (input: {
  database: mongoose.mongo.Db;
  batchSize: number;
  runId: string;
  apply: boolean;
}): Promise<ScanReport> => {
  const report = { findings: emptyFindings(), counts: emptyCounts() };
  const users = input.database.collection<LegacyUserRow>("users");
  const likes = input.database.collection<LegacyLikeRow>("likes");
  const pairs = input.database.collection<PairRow>("pairs");
  const connections = input.database.collection<ConnectionRow>(
    "matching_connections",
  );
  const blocks = input.database.collection<{
    participantKey: string;
    status: string;
  }>("matching_blocks");
  let after: Types.ObjectId | undefined;
  for (;;) {
    const rows = await likes
      .find(after ? { _id: { $gt: after } } : {})
      .project<LegacyLikeRow>({
        fromId: 1,
        toId: 1,
        status: 1,
        legacyStatus: 1,
        revision: 1,
        interactionKey: 1,
        connectionId: 1,
        declinedUntil: 1,
        fromCardSnapshot: 1,
        targetCardSnapshot: 1,
        recipientResponse: 1,
        initiatorDecision: 1,
        agreements: 1,
        answers: 1,
        cardSnapshot: 1,
        migrationVersion: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ _id: 1 })
      .limit(input.batchSize)
      .toArray();
    if (rows.length === 0) break;
    after = rows[rows.length - 1]?._id;
    report.counts.sourceLikes += rows.length;
    const validRows: Array<
      LegacyLikeRow & { fromId: string; toId: string; status: string }
    > = [];
    const payloadPlans = new Map<string, LikePayloadPatch>();
    for (const row of rows) {
      if (!validLikeIdentity(row)) {
        report.findings.malformedLikes += 1;
      } else {
        const payloadPlan = planLikePayload(row);
        if (!payloadPlan.ok) {
          report.findings.likePayloadConflicts += 1;
          continue;
        }
        validRows.push(row);
        payloadPlans.set(String(row._id), payloadPlan.patch);
        if (Object.keys(payloadPlan.patch).length > 0) {
          report.counts.pendingLikePayloadBackfills += 1;
        }
      }
    }
    const participantUserIds = [
      ...new Set(validRows.flatMap((row) => [row.fromId, row.toId])),
    ];
    const existingUsers = await users
      .find({ id: { $in: participantUserIds } })
      .project({ id: 1 })
      .limit(Math.max(1, participantUserIds.length * 2 + 1))
      .toArray();
    const existingUserIds = new Set(
      existingUsers
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string"),
    );
    const matchRows = validRows.filter(
      (row) =>
        row.status === "mutual_ready" ||
        row.status === "paired" ||
        row.status === "MATCHED",
    );
    const participantKeys = [
      ...new Set(
        matchRows.map((row) =>
          canonicalParticipantIds(row.fromId, row.toId).join("|"),
        ),
      ),
    ];
    const pairedKeys = [
      ...new Set(
        matchRows
          .filter((row) => (row.legacyStatus ?? row.status) === "paired")
          .map((row) =>
            canonicalParticipantIds(row.fromId, row.toId).join("|"),
          ),
      ),
    ];
    const pairGroups = pairedKeys.length
      ? await pairs
          .aggregate<PairGroup>([
            {
              $match: {
                key: { $in: pairedKeys },
                status: { $in: ["active", "paused"] },
              },
            },
            {
              $group: {
                _id: "$key",
                count: { $sum: 1 },
                pair: { $first: "$$ROOT" },
              },
            },
          ])
          .toArray()
      : [];
    const pairByKey = new Map(pairGroups.map((group) => [group._id, group]));
    const membershipGroups = participantUserIds.length
      ? await pairs
          .aggregate<MembershipGroup>([
            {
              $match: {
                members: { $in: participantUserIds },
                status: { $in: ["active", "paused"] },
              },
            },
            { $unwind: "$members" },
            { $match: { members: { $in: participantUserIds } } },
            {
              $group: {
                _id: "$members",
                count: { $sum: 1 },
                pairKey: { $first: "$key" },
              },
            },
          ])
          .toArray()
      : [];
    const memberships = new Map(
      membershipGroups.map((group) => [group._id, group]),
    );
    const connectionGroups = participantKeys.length
      ? await connections
          .aggregate<ConnectionGroup>([
            {
              $match: {
                participantKey: { $in: participantKeys },
                status: "ACTIVE",
              },
            },
            {
              $group: {
                _id: "$participantKey",
                count: { $sum: 1 },
                connection: { $first: "$$ROOT" },
              },
            },
          ])
          .toArray()
      : [];
    const connectionByKey = new Map(
      connectionGroups.map((group) => [group._id, group]),
    );
    const blockedKeys = new Set(
      participantKeys.length
        ? await blocks.distinct("participantKey", {
            participantKey: { $in: participantKeys },
            status: "ACTIVE",
          })
        : [],
    );
    const linkedConnectionIds = [
      ...new Set(
        validRows
          .filter((row) => row.status === "MATCHED" && row.connectionId)
          .map((row) => String(row.connectionId)),
      ),
    ]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const linkedConnections = linkedConnectionIds.length
      ? await connections.find({ _id: { $in: linkedConnectionIds } }).toArray()
      : [];
    const linkedById = new Map(
      linkedConnections.map((connection) => [
        String(connection._id),
        connection,
      ]),
    );

    type MatchPlan = {
      key: string;
      participants: [string, string];
      rows: Array<
        LegacyLikeRow & { fromId: string; toId: string; status: string }
      >;
      pair?: PairRow;
      normalizeExisting?: boolean;
    };
    const plans = new Map<string, MatchPlan>();
    for (const row of validRows) {
      if (!existingUserIds.has(row.fromId) || !existingUserIds.has(row.toId)) {
        report.findings.missingLikeParticipants += 1;
        continue;
      }
      const mappedStatus = LEGACY_STATUS_MAPPING.get(row.status);
      if (mappedStatus) report.counts.pendingLikeMappings += 1;
      const expectedInteractionKey = `${row.fromId}|${row.toId}`;
      if (
        !mappedStatus &&
        row.status !== "BLOCKED" &&
        row.interactionKey !== expectedInteractionKey
      ) {
        report.findings.targetLikeConnectionConflicts += 1;
      }
      const originalStatus = row.legacyStatus ?? row.status;
      const requiresConnection =
        row.status === "mutual_ready" ||
        row.status === "paired" ||
        row.status === "MATCHED";
      if (!requiresConnection) continue;
      const participants = canonicalParticipantIds(row.fromId, row.toId);
      const key = participants.join("|");
      const group = connectionByKey.get(key);
      if ((group?.count ?? 0) > 1) {
        report.findings.targetConnectionConflicts += 1;
        continue;
      }
      if (blockedKeys.has(key)) {
        report.findings.matchedParticipantsBlocked += 1;
        continue;
      }
      let verifiedPair: PairRow | undefined;
      if (originalStatus === "paired") {
        const pairGroup = pairByKey.get(key);
        const leftMembership = memberships.get(participants[0]);
        const rightMembership = memberships.get(participants[1]);
        if (
          !pairGroup ||
          pairGroup.count !== 1 ||
          pairGroup.pair.members.length !== 2 ||
          !sameJson([...pairGroup.pair.members].sort(), participants) ||
          leftMembership?.count !== 1 ||
          rightMembership?.count !== 1 ||
          leftMembership.pairKey !== key ||
          rightMembership.pairKey !== key
        ) {
          report.findings.pairedWithoutVerifiedPair += 1;
          continue;
        }
        verifiedPair = pairGroup.pair;
      } else if (originalStatus === "mutual_ready") {
        if (
          memberships.has(participants[0]) ||
          memberships.has(participants[1])
        ) {
          report.findings.matchedParticipantsAlreadyPaired += 1;
          continue;
        }
      }
      let normalizeExisting = false;
      if (group?.connection) {
        const disposition = connectionDisposition(
          group.connection,
          verifiedPair
            ? { kind: "PAIRED", participants, pairId: verifiedPair._id }
            : { kind: "MATCHED", participants },
        );
        if (disposition === "BLOCK") {
          report.findings.targetConnectionConflicts += 1;
          continue;
        }
        if (disposition === "NORMALIZE_MIGRATION_OWNED") {
          normalizeExisting = true;
          report.counts.pendingConnectionNormalizations += 1;
        }
      }
      if (row.connectionId) {
        const linked = linkedById.get(String(row.connectionId));
        if (!linked || !connectionMatchesLike(linked, row)) {
          report.findings.targetLikeConnectionConflicts += 1;
        }
      } else {
        report.counts.pendingLikeConnectionLinks += 1;
      }
      if (!group?.connection) report.counts.pendingConnections += 1;
      const plan = plans.get(key) ?? { key, participants, rows: [] };
      plan.rows.push(row);
      if (verifiedPair) plan.pair = verifiedPair;
      if (normalizeExisting) plan.normalizeExisting = true;
      plans.set(key, plan);
    }

    if (!input.apply) continue;
    const connectionIdByKey = new Map<string, Types.ObjectId>();
    for (const plan of plans.values()) {
      const existing = connectionByKey.get(plan.key)?.connection;
      const targetId = existing?._id ?? deterministicConnectionId(plan.key);
      if (!existing) {
        const conflictingId = await connections.findOne({ _id: targetId });
        if (conflictingId) throw new Error("MATCHING_CONNECTION_ID_CONFLICT");
      }
      const sourceLikeIds = plan.rows.map((row) => String(row._id));
      const createdDates = plan.rows
        .map((row) => row.createdAt)
        .filter((value): value is Date => value instanceof Date);
      const updatedDates = plan.rows
        .map((row) => row.updatedAt)
        .filter((value): value is Date => value instanceof Date);
      const earliest =
        createdDates.sort((a, b) => a.getTime() - b.getTime())[0] ?? new Date();
      const latest =
        updatedDates.sort((a, b) => b.getTime() - a.getTime())[0] ?? earliest;
      const pairedSet = plan.pair
        ? {
            stage: "COUPLE_CONFIRMED" as const,
            status: "ACTIVE" as const,
            pairId: plan.pair._id,
            coupleConfirmation: {
              confirmedBy: [...plan.participants],
              revision: 2,
            },
          }
        : undefined;
      const matchedSet = {
        stage: "MATCHED" as const,
        status: "ACTIVE" as const,
        coupleConfirmation: { confirmedBy: [], revision: 0 },
      };
      const shouldNormalizeState = !existing || plan.normalizeExisting === true;
      const connectionUpdate = await connections.updateOne(
        existing
          ? {
              _id: targetId,
              revision: existing.revision,
              ...(plan.normalizeExisting
                ? {
                    migrationVersion: MATCHING_MIGRATION_VERSION,
                    runId: existing.runId,
                  }
                : { status: "ACTIVE", stage: existing.stage }),
            }
          : { _id: targetId },
        {
          $setOnInsert: {
            _id: targetId,
            participantIds: [...plan.participants],
            participantKey: plan.key,
            runId: input.runId,
            migrationVersion: MATCHING_MIGRATION_VERSION,
          },
          ...(shouldNormalizeState ? { $set: pairedSet ?? matchedSet } : {}),
          ...(shouldNormalizeState && !pairedSet
            ? { $unset: { pairId: 1 } }
            : {}),
          $addToSet: { sourceLikeIds: { $each: sourceLikeIds } },
          $min: { createdAt: earliest },
          $max: { updatedAt: latest, revision: plan.pair ? 2 : 0 },
        },
        { upsert: !existing },
      );
      if (existing && connectionUpdate.matchedCount !== 1) {
        throw new Error("MATCHING_CONNECTION_CHANGED");
      }
      connectionIdByKey.set(plan.key, targetId);
    }
    const operations: mongoose.mongo.AnyBulkWriteOperation<LegacyLikeRow>[] =
      [];
    for (const row of validRows) {
      const mappedStatus = LEGACY_STATUS_MAPPING.get(row.status);
      const payloadPatch = payloadPlans.get(String(row._id)) ?? {};
      const sourceDecisionAt =
        row.updatedAt instanceof Date
          ? row.updatedAt
          : row.createdAt instanceof Date
            ? row.createdAt
            : new Date();
      const requiresConnection =
        mappedStatus === "MATCHED" || row.status === "MATCHED";
      const key = canonicalParticipantIds(row.fromId, row.toId).join("|");
      const connectionId = requiresConnection
        ? connectionIdByKey.get(key)
        : undefined;
      if (requiresConnection && !connectionId) continue;
      if (
        !mappedStatus &&
        !connectionId &&
        Object.keys(payloadPatch).length === 0
      ) {
        continue;
      }
      operations.push({
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              ...(mappedStatus
                ? {
                    status: mappedStatus,
                    legacyStatus: row.status,
                    ...(row.status === "rejected"
                      ? {
                          declinedUntil: new Date(
                            sourceDecisionAt.getTime() + DECLINE_COOLDOWN_MS,
                          ),
                        }
                      : {}),
                  }
                : {}),
              interactionKey: `${row.fromId}|${row.toId}`,
              ...payloadPatch,
              ...(connectionId ? { connectionId } : {}),
              ...(!Number.isInteger(row.revision) ? { revision: 0 } : {}),
              migrationVersion: MATCHING_MIGRATION_VERSION,
            },
          },
        },
      });
    }
    if (operations.length > 0)
      await likes.bulkWrite(operations, { ordered: false });
  }
  return report;
};

const inspectSourceAggregates = async (
  database: mongoose.mongo.Db,
): Promise<ScanReport> => {
  const report = { findings: emptyFindings(), counts: emptyCounts() };
  const users = database.collection("users");
  const likes = database.collection("likes");
  const profiles = database.collection("matching_profiles");
  const projections = database.collection("candidate_discovery_projections");
  const connections = database.collection("matching_connections");
  type CountRow = { groups?: number; count?: number };
  const [
    duplicateUsers,
    unknownStatuses,
    duplicateActiveLikes,
    targetProfiles,
    targetProjections,
    targetConnections,
    targetMigratedLikes,
    orphanProfiles,
    orphanProjections,
    orphanConnections,
    unknownConnectionStates,
  ] = await Promise.all([
    users
      .aggregate<CountRow>(
        [
          { $match: { "profile.matchCard": { $exists: true } } },
          { $group: { _id: "$id", count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $count: "groups" },
        ],
        { allowDiskUse: true },
      )
      .toArray(),
    likes.countDocuments({
      $or: [
        { status: { $exists: false } },
        { status: { $nin: ACCEPTED_STATUSES } },
      ],
    }),
    likes
      .aggregate<CountRow>(
        [
          { $match: { status: { $in: ACTIVE_SOURCE_STATUSES } } },
          {
            $group: {
              _id: { fromId: "$fromId", toId: "$toId" },
              count: { $sum: 1 },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $count: "groups" },
        ],
        { allowDiskUse: true },
      )
      .toArray(),
    profiles.countDocuments({}),
    projections.countDocuments({}),
    connections.countDocuments({}),
    likes.countDocuments({
      $or: [
        { legacyStatus: { $exists: true } },
        { migrationVersion: MATCHING_MIGRATION_VERSION },
      ],
    }),
    profiles
      .aggregate<CountRow>(
        [
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "id",
              as: "sourceUsers",
            },
          },
          { $match: { $expr: { $ne: [{ $size: "$sourceUsers" }, 1] } } },
          { $count: "count" },
        ],
        { allowDiskUse: true },
      )
      .toArray(),
    projections
      .aggregate<CountRow>(
        [
          {
            $lookup: {
              from: "users",
              localField: "userId",
              foreignField: "id",
              as: "sourceUsers",
            },
          },
          {
            $lookup: {
              from: "matching_profiles",
              localField: "userId",
              foreignField: "userId",
              as: "sourceProfiles",
            },
          },
          {
            $match: {
              $expr: {
                $or: [
                  { $ne: [{ $size: "$sourceUsers" }, 1] },
                  { $ne: [{ $size: "$sourceProfiles" }, 1] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        { allowDiskUse: true },
      )
      .toArray(),
    connections
      .aggregate<CountRow>(
        [
          {
            $set: {
              normalizedParticipants: {
                $cond: [{ $isArray: "$participantIds" }, "$participantIds", []],
              },
              normalizedSourceLikeIds: {
                $cond: [
                  { $isArray: "$sourceLikeIds" },
                  { $setUnion: ["$sourceLikeIds", []] },
                  [],
                ],
              },
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "normalizedParticipants",
              foreignField: "id",
              as: "sourceUsers",
            },
          },
          {
            $lookup: {
              from: "likes",
              let: {
                sourceIds: "$normalizedSourceLikeIds",
                participants: "$normalizedParticipants",
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $in: [{ $toString: "$_id" }, "$$sourceIds"] },
                        { $in: ["$fromId", "$$participants"] },
                        { $in: ["$toId", "$$participants"] },
                      ],
                    },
                  },
                },
              ],
              as: "sourceLikes",
            },
          },
          {
            $match: {
              $expr: {
                $or: [
                  { $ne: [{ $size: "$normalizedParticipants" }, 2] },
                  { $ne: [{ $size: "$sourceUsers" }, 2] },
                  { $eq: [{ $size: "$normalizedSourceLikeIds" }, 0] },
                  {
                    $ne: [
                      { $size: "$sourceLikes" },
                      { $size: "$normalizedSourceLikeIds" },
                    ],
                  },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        { allowDiskUse: true },
      )
      .toArray(),
    connections.countDocuments({
      $or: [
        {
          stage: { $nin: ["MATCHED", "TALKING", "DATING", "COUPLE_CONFIRMED"] },
        },
        { status: { $nin: ["ACTIVE", "CLOSED", "BLOCKED"] } },
      ],
    }),
  ]);
  report.findings.duplicateSourceUserIds = duplicateUsers[0]?.groups ?? 0;
  report.findings.unknownLikeStates = unknownStatuses;
  report.findings.duplicateActiveLikeGroups =
    duplicateActiveLikes[0]?.groups ?? 0;
  report.counts.targetProfiles = targetProfiles;
  report.counts.targetProjections = targetProjections;
  report.counts.targetConnections = targetConnections;
  report.counts.targetMigratedLikes = targetMigratedLikes;
  report.findings.orphanTargetProfiles = orphanProfiles[0]?.count ?? 0;
  report.findings.orphanTargetProjections = orphanProjections[0]?.count ?? 0;
  report.findings.orphanTargetConnections = orphanConnections[0]?.count ?? 0;
  report.findings.unknownConnectionStates = unknownConnectionStates;
  return report;
};

const inspectIndexes = async (
  database: mongoose.mongo.Db,
): Promise<ScanReport> => {
  const report = { findings: emptyFindings(), counts: emptyCounts() };
  type CountRow = { groups: number };
  for (const model of indexTargets) {
    const diff = await model.diffIndexes();
    report.counts.missingIndexes += diff.toCreate.length;
    report.findings.extraIndexes += diff.toDrop.length;
    const uniqueIndexes = model.schema
      .indexes()
      .filter(([, options]) => options.unique === true);
    for (const [indexKey, options] of uniqueIndexes) {
      const fields = Object.keys(indexKey);
      if (fields.length === 0) continue;
      const pipeline: mongoose.mongo.Document[] = [];
      if (options.partialFilterExpression) {
        pipeline.push({ $match: options.partialFilterExpression });
      }
      if (options.sparse === true) {
        pipeline.push({
          $match: {
            $or: fields.map((field) => ({ [field]: { $exists: true } })),
          },
        });
      }
      pipeline.push(
        {
          $group: {
            _id: Object.fromEntries(
              fields.map((field, index) => [`f${index}`, `$${field}`]),
            ),
            count: { $sum: 1 },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $count: "groups" },
      );
      const rows = await database
        .collection(model.collection.collectionName)
        .aggregate<CountRow>(pipeline, { allowDiskUse: true })
        .toArray();
      report.findings.duplicateUniqueIndexGroups += rows[0]?.groups ?? 0;
    }
  }
  return report;
};

const createMissingIndexes = async (): Promise<void> => {
  try {
    for (const model of indexTargets) await model.createIndexes();
  } catch {
    throw new Error("MATCHING_MIGRATION_INDEX_APPLY_FAILED");
  }
};

const scan = async (input: {
  database: mongoose.mongo.Db;
  batchSize: number;
  runId: string;
  apply: boolean;
}): Promise<ScanReport> => {
  const report = { findings: emptyFindings(), counts: emptyCounts() };
  mergeReport(report, await inspectSourceAggregates(input.database));
  mergeReport(report, await scanProfiles(input));
  mergeReport(report, await scanLikes(input));
  mergeReport(report, await inspectIndexes(input.database));
  return report;
};

const findingRows = (findings: Findings): number =>
  Object.values(findings).reduce((sum, value) => sum + value, 0);

const pendingRows = (counts: Counts): number =>
  counts.pendingProfiles +
  counts.pendingProjections +
  counts.pendingLikeMappings +
  counts.pendingLikePayloadBackfills +
  counts.pendingLikeConnectionLinks +
  counts.pendingConnections +
  counts.pendingConnectionNormalizations +
  counts.pendingActualProfileRemovals +
  counts.missingIndexes;

const sanitizedReport = (input: {
  ok: boolean;
  mode: MigrationMode;
  batchSize: number;
  phase: "PLAN" | "VERIFY";
  report: ScanReport;
}) => ({
  ok: input.ok,
  migrationVersion: MATCHING_MIGRATION_VERSION,
  mode: input.mode,
  phase: input.phase,
  batchSize: input.batchSize,
  counts: input.report.counts,
  findings: input.report.findings,
});

const writeReport = (input: Parameters<typeof sanitizedReport>[0]): void => {
  process.stdout.write(`${JSON.stringify(sanitizedReport(input))}\n`);
};

export const matchingMigrationTestSupport = {
  canonicalStatus: (status: string): string | null =>
    LEGACY_STATUS_MAPPING.get(status) ??
    (CANONICAL_STATUSES.includes(status as (typeof CANONICAL_STATUSES)[number])
      ? status
      : null),
  deterministicConnectionId: (left: string, right: string): string =>
    deterministicConnectionId(
      canonicalParticipantIds(left, right).join("|"),
    ).toHexString(),
  expectedFromUser: (row: LegacyUserRow) => {
    const findings = emptyFindings();
    return { value: expectedFromUser(row, findings), findings };
  },
  activeSourceStatuses: [...ACTIVE_SOURCE_STATUSES],
  planLikePayload: (row: LegacyLikeRow & { status: string }) =>
    planLikePayload(row),
  connectionDisposition: (
    connection: ConnectionRow,
    expectation: ConnectionExpectation,
  ) => connectionDisposition(connection, expectation),
  sanitizedReport: () =>
    sanitizedReport({
      ok: true,
      mode: "VERIFY",
      phase: "VERIFY",
      batchSize: DEFAULT_BATCH_SIZE,
      report: { findings: emptyFindings(), counts: emptyCounts() },
    }),
};

const main = async (): Promise<void> => {
  const mode = readMode();
  const batchSize = readBatchSize();
  const target = requireMatchingTestDatabaseTarget();
  if (
    mode === "APPLY_ADDITIVE" &&
    process.env.MATCHING_MIGRATION_CONFIRM !==
      "APPLY_ADDITIVE_MATCHING_MIGRATION"
  ) {
    throw new Error("MATCHING_MIGRATION_CONFIRMATION_REQUIRED");
  }
  const runId = randomUUID();
  await mongoose.connect(target.uri, {
    autoIndex: false,
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error("DATABASE_NOT_CONNECTED");
    const plan = await scan({ database, batchSize, runId, apply: false });
    const planBlocked = findingRows(plan.findings) > 0;
    if (mode === "DRY_RUN") {
      writeReport({
        ok: !planBlocked,
        mode,
        batchSize,
        phase: "PLAN",
        report: plan,
      });
      if (planBlocked) process.exitCode = 1;
      return;
    }
    if (mode === "VERIFY") {
      const ok = !planBlocked && pendingRows(plan.counts) === 0;
      writeReport({
        ok,
        mode,
        batchSize,
        phase: "VERIFY",
        report: plan,
      });
      if (!ok) process.exitCode = 1;
      return;
    }
    if (planBlocked) {
      writeReport({
        ok: false,
        mode,
        batchSize,
        phase: "PLAN",
        report: plan,
      });
      process.exitCode = 1;
      return;
    }
    await scanProfiles({ database, batchSize, runId, apply: true });
    await scanLikes({ database, batchSize, runId, apply: true });
    await createMissingIndexes();
    const verification = await scan({
      database,
      batchSize,
      runId,
      apply: false,
    });
    const ok =
      findingRows(verification.findings) === 0 &&
      pendingRows(verification.counts) === 0;
    writeReport({
      ok,
      mode,
      batchSize,
      phase: "VERIFY",
      report: verification,
    });
    if (!ok) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === resolve(fileURLToPath(import.meta.url))) {
  void main().catch((error: Error) => {
    const allowedReasons = new Set([
      "MATCHING_MIGRATION_MODE_INVALID",
      "MATCHING_MIGRATION_BATCH_SIZE_INVALID",
      "MATCHING_MIGRATION_CONFIRMATION_REQUIRED",
      "MATCHING_MIGRATION_INDEX_APPLY_FAILED",
      "MATCHING_CONNECTION_ID_CONFLICT",
      "MATCHING_CONNECTION_CHANGED",
      "MATCHING_TEST_MONGODB_URI_REQUIRED",
      "MATCHING_TEST_MONGODB_URI_INVALID",
      "MATCHING_TEST_DATABASE_GUARD_FAILED",
      "DATABASE_NOT_CONNECTED",
    ]);
    const reason = allowedReasons.has(error.message)
      ? error.message
      : "MATCHING_MIGRATION_FAILED";
    process.stderr.write(`${JSON.stringify({ ok: false, reason })}\n`);
    process.exitCode = 1;
  });
}
