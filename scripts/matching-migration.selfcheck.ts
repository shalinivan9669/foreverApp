import assert from "node:assert/strict";
import { Types } from "mongoose";
import { matchingMigrationTestSupport } from "./migrate-matching";

const legacyMappings = {
  sent: "SENT",
  viewed: "VIEWED",
  awaiting_initiator: "RESPONDED",
  mutual_ready: "MATCHED",
  paired: "MATCHED",
  rejected: "DECLINED",
  expired: "EXPIRED",
} as const;

for (const [legacy, canonical] of Object.entries(legacyMappings)) {
  assert.equal(matchingMigrationTestSupport.canonicalStatus(legacy), canonical);
}
for (const canonical of [
  "SENT",
  "VIEWED",
  "RESPONDED",
  "MATCHED",
  "DECLINED",
  "EXPIRED",
  "BLOCKED",
]) {
  assert.equal(
    matchingMigrationTestSupport.canonicalStatus(canonical),
    canonical,
  );
}
assert.equal(matchingMigrationTestSupport.canonicalStatus("UNKNOWN"), null);
assert.equal(
  matchingMigrationTestSupport.deterministicConnectionId("user-b", "user-a"),
  matchingMigrationTestSupport.deterministicConnectionId("user-a", "user-b"),
);
assert.ok(matchingMigrationTestSupport.activeSourceStatuses.includes("paired"));

const validUser = {
  _id: new Types.ObjectId(),
  id: "migration-user",
  personal: { age: 31, city: "Almaty" },
  preferences: {
    desiredAgeRange: { min: 25, max: 38 },
    maxDistanceKm: 75,
  },
  profile: {
    matchCard: {
      requirements: ["kind", "honest", "curious"],
      give: ["support", "humor", "care"],
      questions: ["What matters?", "How do you rest?"],
      isActive: true,
      updatedAt: new Date("2026-08-13T00:00:00.000Z"),
    },
  },
  location: { type: "Point", coordinates: [76.89, 43.24] },
};
const planned = matchingMigrationTestSupport.expectedFromUser(validUser);
assert.ok(planned.value);
assert.equal(planned.value.profile.discoveryRequested, true);
assert.equal(planned.value.profile.active, false);
assert.equal(planned.value.profile.requiredDataReady, false);
assert.equal("actual" in planned.value.profile, false);
assert.deepEqual(planned.value.projection.location, validUser.location);
assert.match(planned.value.profile.projectionHash, /^[a-f\d]{64}$/);

const missingLocation = matchingMigrationTestSupport.expectedFromUser({
  ...validUser,
  _id: new Types.ObjectId(),
  location: undefined,
});
assert.equal(missingLocation.value, null);
assert.equal(missingLocation.findings.invalidLocations, 1);

const inactiveWithoutLocation = matchingMigrationTestSupport.expectedFromUser({
  ...validUser,
  _id: new Types.ObjectId(),
  profile: {
    matchCard: {
      ...validUser.profile.matchCard,
      isActive: false,
    },
  },
  location: undefined,
});
assert.ok(inactiveWithoutLocation.value);
assert.equal(inactiveWithoutLocation.value.profile.discoveryRequested, false);
assert.equal(inactiveWithoutLocation.value.projection.location, undefined);

const senderSnapshot = {
  requirements: ["kind", "honest", "curious"],
  give: ["support", "humor", "care"],
  questions: ["What matters?", "How do you rest?"],
  updatedAt: new Date("2026-08-12T00:00:00.000Z"),
};
const targetSnapshot = {
  requirements: ["calm", "direct", "reliable"],
  give: ["time", "respect", "warmth"],
  questions: ["What is trust?", "What is home?"],
  updatedAt: new Date("2026-08-11T00:00:00.000Z"),
};
const sourceAt = new Date("2026-08-13T01:00:00.000Z");
const baseLike = {
  _id: new Types.ObjectId(),
  fromId: "user-a",
  toId: "user-b",
  createdAt: sourceAt,
  updatedAt: sourceAt,
};
const sentBackfill = matchingMigrationTestSupport.planLikePayload({
  ...baseLike,
  status: "sent",
  cardSnapshot: senderSnapshot,
});
assert.equal(sentBackfill.ok, true);
assert.deepEqual(sentBackfill.patch.fromCardSnapshot, senderSnapshot);
assert.equal("targetCardSnapshot" in sentBackfill.patch, false);
assert.equal(
  matchingMigrationTestSupport.planLikePayload({
    ...baseLike,
    status: "SENT",
    fromCardSnapshot: senderSnapshot,
    cardSnapshot: targetSnapshot,
  }).ok,
  false,
);
assert.equal(
  matchingMigrationTestSupport.planLikePayload({
    ...baseLike,
    status: "viewed",
  }).ok,
  false,
);

const respondedBackfill = matchingMigrationTestSupport.planLikePayload({
  ...baseLike,
  status: "awaiting_initiator",
  cardSnapshot: senderSnapshot,
  targetCardSnapshot: targetSnapshot,
  agreements: [true, true, true],
  answers: ["Answer one", "Answer two"],
});
assert.equal(respondedBackfill.ok, true);
assert.deepEqual(
  respondedBackfill.patch.recipientResponse?.initiatorCardSnapshot,
  senderSnapshot,
);
assert.equal("targetCardSnapshot" in respondedBackfill.patch, false);
assert.equal(
  matchingMigrationTestSupport.planLikePayload({
    ...baseLike,
    status: "awaiting_initiator",
    cardSnapshot: senderSnapshot,
    agreements: [true, true, true],
    answers: ["Answer one", "Answer two"],
  }).ok,
  false,
);

const matchedBackfill = matchingMigrationTestSupport.planLikePayload({
  ...baseLike,
  status: "mutual_ready",
  cardSnapshot: senderSnapshot,
  targetCardSnapshot: targetSnapshot,
  agreements: [true, true, true],
  answers: ["Answer one", "Answer two"],
});
assert.equal(matchedBackfill.ok, true);
assert.deepEqual(matchedBackfill.patch.initiatorDecision, {
  accepted: true,
  at: sourceAt,
});
assert.equal(
  matchingMigrationTestSupport.planLikePayload({
    ...baseLike,
    status: "RESPONDED",
    fromCardSnapshot: senderSnapshot,
    targetCardSnapshot: targetSnapshot,
    recipientResponse: {
      agreements: [true, true, false],
      answers: ["Answer one", "Answer two"],
      initiatorCardSnapshot: senderSnapshot,
      at: sourceAt,
    },
  }).ok,
  false,
);

const participantIds: [string, string] = ["user-a", "user-b"];
const connectionId = new Types.ObjectId(
  matchingMigrationTestSupport.deterministicConnectionId(...participantIds),
);
const migrationConnection = {
  _id: connectionId,
  participantIds,
  participantKey: participantIds.join("|"),
  sourceLikeIds: [String(baseLike._id)],
  stage: "COUPLE_CONFIRMED",
  status: "ACTIVE",
  coupleConfirmation: { confirmedBy: participantIds, revision: 2 },
  revision: 0,
  runId: "migration-run",
  migrationVersion: "matching-additive-v1",
};
assert.equal(
  matchingMigrationTestSupport.connectionDisposition(migrationConnection, {
    kind: "MATCHED",
    participants: participantIds,
  }),
  "NORMALIZE_MIGRATION_OWNED",
);
assert.equal(
  matchingMigrationTestSupport.connectionDisposition(
    { ...migrationConnection, runId: undefined },
    { kind: "MATCHED", participants: participantIds },
  ),
  "BLOCK",
);
assert.equal(
  matchingMigrationTestSupport.connectionDisposition(
    {
      ...migrationConnection,
      stage: "MATCHED",
      coupleConfirmation: { confirmedBy: [], revision: 0 },
    },
    { kind: "MATCHED", participants: participantIds },
  ),
  "VALID",
);
assert.equal(
  matchingMigrationTestSupport.connectionDisposition(
    {
      ...migrationConnection,
      stage: "MATCHED",
      coupleConfirmation: {
        requestedBy: "user-a",
        confirmedBy: ["user-a"],
        revision: 1,
      },
    },
    { kind: "MATCHED", participants: participantIds },
  ),
  "NORMALIZE_MIGRATION_OWNED",
);

const pairId = new Types.ObjectId();
assert.equal(
  matchingMigrationTestSupport.connectionDisposition(
    {
      ...migrationConnection,
      pairId,
      revision: 2,
    },
    { kind: "PAIRED", participants: participantIds, pairId },
  ),
  "VALID",
);
assert.equal(
  matchingMigrationTestSupport.connectionDisposition(
    {
      ...migrationConnection,
      stage: "UNKNOWN",
    },
    { kind: "MATCHED", participants: participantIds },
  ),
  "BLOCK",
);
assert.equal(
  matchingMigrationTestSupport.connectionDisposition(
    {
      ...migrationConnection,
      stage: "UNKNOWN",
      runId: undefined,
    },
    { kind: "MATCHED", participants: participantIds },
  ),
  "BLOCK",
);

const report = matchingMigrationTestSupport.sanitizedReport();
assert.equal("databaseAlias" in report, false);
assert.equal("runId" in report, false);
assert.equal(report.findings.orphanTargetProfiles, 0);
assert.equal(report.findings.orphanTargetProjections, 0);
assert.equal(report.findings.orphanTargetConnections, 0);
assert.equal(report.findings.unknownConnectionStates, 0);

process.stdout.write("matching migration selfcheck passed\n");
