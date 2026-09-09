import assert from "node:assert/strict";
import { DomainError } from "@/domain/errors";
import { assertMatchingConnectionCapacity, matchingRequestExpired, MATCHING_REQUEST_TTL_MS, validateMatchingResponse, type MatchingSocialCard, type MatchingStatementReaction } from "@/domain/model/matching/socialContract";
import { conversationRoundDTO, MATCHING_CONVERSATION_TOPICS, type ConversationRoundRecord } from "@/domain/model/matching/conversation";
import { matchingConnectionTransition, socialLikeTransition, type MatchingConnectionSnapshot } from "@/domain/state/matching";
import { matchingCardBodySchema } from "@/app/api/match/schemas";
import { isMatchingPersonEligible, mutualMatchingGenderEligible } from "@/domain/services/matching/matchingEligibility.service";
import { checkMatchingInboxPausedConnections } from "./lib/matching-inbox-regression";

const now = new Date("2026-09-05T12:00:00Z");
const card: MatchingSocialCard = { cardVersion: 2, requirements: ["r1", "r2", "r3"], give: ["g1", "g2", "g3"], boundaries: ["b1", "b2", "b3"], boundaryDealbreakers: [true, false, false], questions: ["q1", "q2", "q3"] };
const reactions: MatchingStatementReaction[] = (["give", "requirements", "boundaries"] as const).flatMap((section) => [0, 1, 2].map((index) => ({ section, index, reaction: "NEUTRAL" as const })));
const throwsCode = (operation: () => void, code: string) => assert.throws(operation, (error: Error) => error instanceof DomainError && error.code === code);
validateMatchingResponse(card, ["a1", "a2", "a3"], reactions);
validateMatchingResponse(card, ["a1", "a2", "a3"], reactions.map((item) => item.section === "give" || (item.section === "boundaries" && item.index === 1) ? { ...item, reaction: "AGAINST", note: "A difference we can discuss" } : item));
throwsCode(() => validateMatchingResponse(card, ["a1", "a2", "a3"], []), "VALIDATION_ERROR");
throwsCode(() => validateMatchingResponse(card, ["a1", "a2"], reactions), "VALIDATION_ERROR");
throwsCode(() => validateMatchingResponse(card, ["a1", "a2", "a3"], [...reactions.slice(1), reactions[1]]), "VALIDATION_ERROR");
throwsCode(() => validateMatchingResponse(card, ["a1", "a2", "a3"], reactions.map((item) => item.section === "boundaries" && item.index === 0 ? { ...item, reaction: "AGAINST" } : item)), "MATCHING_DEALBREAKER_CONFLICT");
validateMatchingResponse({ requirements: ["r1", "r2", "r3"], questions: ["old1", "old2"] }, ["legacy1", "legacy2"]);
assert.equal(matchingCardBodySchema.safeParse({ requirements: card.requirements, give: card.give, questions: ["old1", "old2"], ageRange: { min: 18, max: 99 }, maxDistanceKm: 50, active: false, actual: { relationshipIntent: "GETTING_TO_KNOW", childrenIntent: "UNSURE" } }).success, false, "Legacy snapshots may be read, but republishing requires current fields");

assertMatchingConnectionCapacity([0, 2]);
throwsCode(() => assertMatchingConnectionCapacity([2, 3]), "MATCHING_CONNECTION_LIMIT");
assert.equal(matchingRequestExpired(new Date(now.getTime() - MATCHING_REQUEST_TTL_MS + 1), now), false);
assert.equal(matchingRequestExpired(new Date(now.getTime() - MATCHING_REQUEST_TTL_MS), now), true);
assert.equal(socialLikeTransition({ status: "VIEWED", revision: 2 }, { type: "RESPOND" }, "RECIPIENT").nextStatus, "MATCHED");
assert.equal(socialLikeTransition({ status: "SENT", revision: 1 }, { type: "WITHDRAW" }, "SENDER").nextStatus, "WITHDRAWN");
throwsCode(() => socialLikeTransition({ status: "SENT", revision: 1 }, { type: "WITHDRAW" }, "RECIPIENT"), "ACCESS_DENIED");

const base: MatchingConnectionSnapshot = { participantIds: ["a", "b"], stage: "TALKING", status: "ACTIVE", revision: 0, coupleConfirmation: { confirmedBy: [], revision: 0 } };
const paused = matchingConnectionTransition(base, { type: "PAUSE", at: now }, "a").next;
assert.equal(paused.status, "PAUSED");
throwsCode(() => matchingConnectionTransition(paused, { type: "REQUEST", at: now }, "b"), "MATCHING_CONNECTION_STATE_CONFLICT");
assert.equal(matchingConnectionTransition(paused, { type: "CLOSE", at: now }, "b").next.status, "CLOSED");
const resumed = matchingConnectionTransition(paused, { type: "RESUME", at: now }, "b").next;
const proposal = matchingConnectionTransition(resumed, { type: "REQUEST", at: now }, "a").next;
throwsCode(() => matchingConnectionTransition(proposal, { type: "CONFIRM", at: now }, "a"), "MATCHING_CONNECTION_STATE_CONFLICT");
assert.equal(matchingConnectionTransition(proposal, { type: "CONFIRM", at: now }, "b").next.stage, "COUPLE_CONFIRMED", "Conversation stage does not impose an XP gate");

const topic = MATCHING_CONVERSATION_TOPICS[0];
const first: ConversationRoundRecord = { topicKey: topic.key, round: 1, participantIds: ["a", "b"], answers: [{ userId: "a", text: "private-a", submittedAt: now }] };
assert.equal(conversationRoundDTO(topic, first, "a").ownAnswer, "private-a");
assert.equal(JSON.stringify(conversationRoundDTO(topic, first, "b")).includes("private-a"), false);
assert.equal(conversationRoundDTO(topic, first, "b").partnerSubmitted, true);
const both = { ...first, answers: [...first.answers, { userId: "b", text: "private-b", submittedAt: now }], revealedAt: now };
assert.equal(conversationRoundDTO(topic, both, "a").partnerAnswer, "private-b");
assert.equal(conversationRoundDTO(topic, both, "b").partnerAnswer, "private-a");
assert.equal(conversationRoundDTO(topic, { ...both, revealedAt: undefined }, "a").partnerAnswer, undefined, "Two rows alone do not bypass the explicit reveal transition");

const personA = { id: "a", entryCohort: "SOLO" as const, personal: { age: 25, gender: "female" as const, relationshipStatus: "seeking" as const } };
const personB = { id: "b", entryCohort: "SOLO" as const, personal: { age: 26, gender: "male" as const, relationshipStatus: "seeking" as const } };
assert.equal(isMatchingPersonEligible({ ...personA, entryCohort: undefined }), false, "An adult without an explicitly selected entry route cannot enter matching");
assert.equal(isMatchingPersonEligible({ ...personA, personal: { ...personA.personal, relationshipStatus: "in_relationship" } }), false, "Declared relationship status excludes matching even before accounts are linked");
assert.equal(isMatchingPersonEligible({ ...personA, hasPair: true }), false, "A current Pair excludes matching despite stale SOLO demographics");
assert.equal(isMatchingPersonEligible({ id: "fresh" }), false, "A minimal OAuth identity has no matching eligibility");
assert.equal(isMatchingPersonEligible({ ...personA, personal: undefined }), false);
assert.equal(mutualMatchingGenderEligible(personA, personB, { soughtGender: "male" }, { soughtGender: "female" }), true);
assert.equal(mutualMatchingGenderEligible(personA, personB, { soughtGender: "female" }), false);
assert.equal(mutualMatchingGenderEligible(personA, { ...personB, entryCohort: "EXISTING_PARTNER" }), false);
assert.equal(mutualMatchingGenderEligible(personA, { ...personB, personal: { ...personB.personal, age: 17 } }), false);
void checkMatchingInboxPausedConnections().then(() => {
  console.log("matching-product.selfcheck: ok (reactions, boundaries, expiry, slots, lifecycle, paused inbox reload, independent reveal, cohort)");
}).catch((error: Error) => { console.error(error); process.exitCode = 1; });
