import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DomainError } from "@/domain/errors";
import {
  canonicalLikeStatusFromLegacy,
  matchingConnectionTransition,
  matchingParticipantIds,
  matchingParticipantKey,
  socialLikeTransition,
  type MatchingConnectionSnapshot,
  type SocialLikeSnapshot,
} from "@/domain/state/matching";

const now = new Date("2026-08-13T12:00:00.000Z");

const expectDomainError = (
  operation: () => void,
  status: number,
  code: string,
): void => {
  assert.throws(
    operation,
    (error: Error) =>
      error instanceof DomainError &&
      error.status === status &&
      error.code === code,
  );
};

assert.deepEqual(matchingParticipantIds("user-b", "user-a"), [
  "user-a",
  "user-b",
]);
assert.equal(matchingParticipantKey("user-b", "user-a"), "user-a|user-b");
expectDomainError(
  () => matchingParticipantKey("user-a", "user-a"),
  409,
  "MATCHING_SELF_INTERACTION",
);

const created = socialLikeTransition(
  { status: "DRAFT", revision: 0 },
  { type: "CREATE" },
  "SENDER",
);
assert.deepEqual(created, {
  outcome: "APPLIED",
  previousStatus: "DRAFT",
  nextStatus: "SENT",
  nextRevision: 1,
});

const viewed = socialLikeTransition(
  { status: created.nextStatus, revision: created.nextRevision },
  { type: "VIEW" },
  "RECIPIENT",
);
const responded = socialLikeTransition(
  { status: viewed.nextStatus, revision: viewed.nextRevision },
  { type: "RESPOND" },
  "RECIPIENT",
);
const matched = socialLikeTransition(
  { status: responded.nextStatus, revision: responded.nextRevision },
  { type: "ACCEPT" },
  "SENDER",
);
assert.equal(matched.nextStatus, "MATCHED");
assert.equal(matched.nextRevision, 4);
assert.equal(
  socialLikeTransition(
    { status: "MATCHED", revision: 4 },
    { type: "ACCEPT" },
    "SENDER",
  ).outcome,
  "NOOP",
);

const senderDecline = socialLikeTransition(
  { status: "RESPONDED", revision: 3 },
  { type: "DECLINE" },
  "SENDER",
);
assert.equal(senderDecline.nextStatus, "DECLINED");
assert.equal(
  socialLikeTransition(
    { status: "DECLINED", revision: 4, declinedByRole: "SENDER" },
    { type: "DECLINE" },
    "SENDER",
  ).outcome,
  "NOOP",
);

const recipientDecline = socialLikeTransition(
  { status: "VIEWED", revision: 2 },
  { type: "DECLINE" },
  "RECIPIENT",
);
assert.equal(recipientDecline.nextStatus, "DECLINED");
expectDomainError(
  () =>
    socialLikeTransition(
      { status: "SENT", revision: 1 },
      { type: "DECLINE" },
      "SENDER",
    ),
  409,
  "MATCHING_STATE_CONFLICT",
);
expectDomainError(
  () =>
    socialLikeTransition(
      { status: "RESPONDED", revision: 3 },
      { type: "DECLINE" },
      "RECIPIENT",
    ),
  409,
  "MATCHING_STATE_CONFLICT",
);
expectDomainError(
  () =>
    socialLikeTransition(
      { status: "DECLINED", revision: 4 },
      { type: "RESPOND" },
      "RECIPIENT",
    ),
  409,
  "MATCHING_STATE_CONFLICT",
);
expectDomainError(
  () =>
    socialLikeTransition(
      { status: "EXPIRED", revision: 2 },
      { type: "VIEW" },
      "RECIPIENT",
    ),
  409,
  "MATCHING_STATE_CONFLICT",
);

for (const status of ["SENT", "VIEWED", "RESPONDED", "MATCHED"] as const) {
  const blocked = socialLikeTransition(
    { status, revision: 10 },
    { type: "BLOCK" },
    "SENDER",
  );
  assert.equal(blocked.nextStatus, "BLOCKED");
}
expectDomainError(
  () =>
    socialLikeTransition(
      { status: "RESPONDED", revision: 3 },
      { type: "BLOCK" },
      "SYSTEM",
    ),
  403,
  "ACCESS_DENIED",
);

assert.equal(canonicalLikeStatusFromLegacy("sent"), "SENT");
assert.equal(canonicalLikeStatusFromLegacy("awaiting_initiator"), "RESPONDED");
assert.equal(canonicalLikeStatusFromLegacy("mutual_ready"), "MATCHED");
assert.equal(canonicalLikeStatusFromLegacy("paired"), null);

const baseConnection = (): MatchingConnectionSnapshot => ({
  participantIds: matchingParticipantIds("user-a", "user-b"),
  stage: "MATCHED",
  status: "ACTIVE",
  coupleConfirmation: { confirmedBy: [], revision: 0 },
  revision: 1,
});

const requested = matchingConnectionTransition(
  baseConnection(),
  { type: "REQUEST", at: now },
  "user-a",
);
assert.equal(requested.next.coupleConfirmation.requestedBy, "user-a");
assert.deepEqual(requested.next.coupleConfirmation.confirmedBy, ["user-a"]);
assert.equal(
  matchingConnectionTransition(
    requested.next,
    { type: "REQUEST", at: now },
    "user-a",
  ).outcome,
  "NOOP",
);
expectDomainError(
  () =>
    matchingConnectionTransition(
      requested.next,
      { type: "REQUEST", at: now },
      "user-b",
    ),
  409,
  "MATCHING_CONNECTION_STATE_CONFLICT",
);

const confirmed = matchingConnectionTransition(
  requested.next,
  { type: "CONFIRM", at: now },
  "user-b",
);
assert.equal(confirmed.next.stage, "COUPLE_CONFIRMED");
assert.deepEqual(confirmed.next.coupleConfirmation.confirmedBy, [
  "user-a",
  "user-b",
]);
const pairFormed = matchingConnectionTransition(
  confirmed.next,
  { type: "PAIR_FORMED", pairId: "pair-1", at: now },
  "SYSTEM",
);
assert.equal(pairFormed.next.pairId, "pair-1");
assert.equal(
  matchingConnectionTransition(
    pairFormed.next,
    { type: "PAIR_FORMED", pairId: "pair-1", at: now },
    "SYSTEM",
  ).outcome,
  "NOOP",
);
expectDomainError(
  () =>
    matchingConnectionTransition(
      pairFormed.next,
      { type: "CANCEL", at: now },
      "user-a",
    ),
  409,
  "MATCHING_CONNECTION_STATE_CONFLICT",
);

const cancelled = matchingConnectionTransition(
  requested.next,
  { type: "CANCEL", at: now },
  "user-b",
);
assert.equal(cancelled.next.coupleConfirmation.requestedBy, undefined);
assert.deepEqual(cancelled.next.coupleConfirmation.confirmedBy, []);
assert.equal(
  matchingConnectionTransition(
    cancelled.next,
    { type: "REQUEST", at: now },
    "user-b",
  ).next.coupleConfirmation.requestedBy,
  "user-b",
);

const blockedConnection = matchingConnectionTransition(
  requested.next,
  { type: "BLOCK", at: now },
  "user-b",
);
assert.equal(blockedConnection.next.status, "BLOCKED");
assert.deepEqual(blockedConnection.next.coupleConfirmation.confirmedBy, []);
expectDomainError(
  () =>
    matchingConnectionTransition(
      blockedConnection.next,
      { type: "CONFIRM", at: now },
      "user-a",
    ),
  409,
  "MATCHING_CONNECTION_STATE_CONFLICT",
);
expectDomainError(
  () =>
    matchingConnectionTransition(
      baseConnection(),
      { type: "REQUEST", at: now },
      "attacker",
    ),
  404,
  "NOT_FOUND",
);

const socialDirectory = join(
  process.cwd(),
  "src",
  "domain",
  "services",
  "matching",
  "social",
);
const socialSources = readdirSync(socialDirectory)
  .filter((fileName) => fileName.endsWith(".ts"))
  .map((fileName) => readFileSync(join(socialDirectory, fileName), "utf8"))
  .join("\n");
for (const forbiddenImport of [
  "/factor/",
  "/aggregation/",
  "/strategies/",
  "/ranking/",
  "FactorRegistry",
]) {
  assert.equal(
    socialSources.includes(forbiddenImport),
    false,
    `Social matching boundary imports forbidden dependency: ${forbiddenImport}`,
  );
}

const socialServiceSource = readFileSync(
  join(socialDirectory, "matchingSocial.service.ts"),
  "utf8",
);
const blockParticipantSource = socialServiceSource.slice(
  socialServiceSource.indexOf("const blockParticipant = async"),
  socialServiceSource.indexOf("const unblockParticipant = async"),
);
assert.match(
  blockParticipantSource,
  /CandidatePresentationGrant\.updateMany\([\s\S]*requesterId: input\.actorId, candidateId: input\.targetId[\s\S]*requesterId: input\.targetId, candidateId: input\.actorId[\s\S]*revokedAt: \{ \$exists: false \}[\s\S]*\$set: \{ revokedAt: now \}[\s\S]*\{ session \}/,
  "Blocking must revoke both directional candidate grants in the block transaction",
);

const applicationSource = readFileSync(
  join(
    process.cwd(),
    "src",
    "domain",
    "services",
    "matching",
    "matchingApplication.service.ts",
  ),
  "utf8",
);
const transactionalEffectsSource = applicationSource.slice(
  applicationSource.indexOf("const socialEffects:"),
  applicationSource.indexOf("const socialService ="),
);
assert.match(transactionalEffectsSource, /EventLog\.updateOne\(/);
assert.match(transactionalEffectsSource, /eventKey/);
assert.match(
  transactionalEffectsSource,
  /upsert: true, session: input\.session/,
);
const socialTransportMutations = applicationSource.slice(
  applicationSource.indexOf("export async function createMatchingLike"),
  applicationSource.indexOf("const decodeInboxCursor"),
);
assert.doesNotMatch(
  socialTransportMutations,
  /emitEvent\(/,
  "Social audit must stay in the canonical transaction instead of using a post-commit best-effort write",
);
const confirmationTransport = applicationSource.slice(
  applicationSource.indexOf("export async function confirmMatchingConnection"),
);
assert.doesNotMatch(
  confirmationTransport,
  /emitEvent\(/,
  "Connection/Pair audit must commit with its matching transaction",
);

const compileOnlySnapshot: SocialLikeSnapshot = {
  status: "SENT",
  revision: 1,
};
assert.equal(compileOnlySnapshot.status, "SENT");

console.log("matching-social.selfcheck: ok");
