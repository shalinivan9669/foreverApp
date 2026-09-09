import { DEVELOPMENT_CATALOG } from "@/domain/model/development/catalog";
import mongoose, { Types, type ClientSession } from "mongoose";
import { DomainError } from "@/domain/errors";
import { MATCHING_CONVERSATION_TOPICS, conversationRoundDTO, type MatchingConversationDTO } from "@/domain/model/matching/conversation";
import { connectToDatabase } from "@/lib/mongodb";
import { MatchingConnection, type MatchingConnectionType } from "@/models/MatchingConnection";
import { MatchingConversationRound, type MatchingConversationRoundType } from "@/models/MatchingConversationRound";
import { MatchingBlock } from "@/models/MatchingBlock";
import { mongoMatchingParticipantFencePort } from "./social/mongoParticipantFence.port";
import { matchingParticipantIds } from "@/domain/state/matching";
import { assertMatchingSolo, isMatchingPersonEligible, loadMatchingPeople } from "./matchingEligibility.service";

const conversationTopics = [...MATCHING_CONVERSATION_TOPICS, ...DEVELOPMENT_CATALOG.filter((content) => content.kind === "TOPIC").map((content) => ({ key: content.key, title: content.title, prompt: content.title + ". " + content.steps.join(" ") }))];

const fail = (code: string, status: number, message: string): never => { throw new DomainError({ code, status, message }); };

const ownedConnection = async (actorId: string, connectionId: string, session?: ClientSession) => {
  if (!Types.ObjectId.isValid(connectionId)) return fail("NOT_FOUND", 404, "Connection not found");
  const connection = await MatchingConnection.findOne({ _id: new Types.ObjectId(connectionId), participantIds: actorId }).session(session ?? null).lean<MatchingConnectionType | null>();
  if (!connection) return fail("NOT_FOUND", 404, "Connection not found");
  const blocked = await MatchingBlock.exists({ participantKey: connection.participantKey, status: "ACTIVE" }).session(session ?? null);
  if (blocked || connection.status === "BLOCKED") return fail("MATCHING_BLOCKED", 409, "Connection unavailable");
  return connection;
};

export async function getMatchingConversation(input: { currentUserId: string; connectionId: string }): Promise<MatchingConversationDTO> {
  await connectToDatabase();
  const connection = await ownedConnection(input.currentUserId, input.connectionId);
  // One bounded indexed lookup per catalog topic avoids truncating another topic's history.
  const people = await loadMatchingPeople(connection.participantIds);
  const matchingAvailable = connection.participantIds.every((id) => isMatchingPersonEligible(people.get(id)));
  const topics = await Promise.all(conversationTopics.map(async (topic) => {
    const row = await MatchingConversationRound.findOne({ connectionId: connection._id, topicKey: topic.key }).sort({ round: -1 }).select("+answers").lean<MatchingConversationRoundType | null>();
    return conversationRoundDTO(topic, row ?? undefined, input.currentUserId);
  }));
  const complete = (key: string) => topics.some((topic) => topic.topicKey === key && topic.revealed);
  const checklist = [
    { key: "boundaries", label: "Обсудили личные границы", complete: complete("boundaries") },
    { key: "relationship-work", label: "Поделились готовностью работать над отношениями", complete: complete("relationship-work") },
    { key: "mutual-interest", label: "Поделились интересом к продолжению", complete: complete("mutual-interest") },
    { key: "after-conversation", label: "Обменялись впечатлениями после общения", complete: complete("after-conversation") },
  ];
  const discordAvailable = matchingAvailable && connection.status === "ACTIVE" && complete("boundaries") && complete("mutual-interest");
  const discordConsent = connection.discordConsentBy?.includes(input.currentUserId) ?? false;
  const partnerId = connection.participantIds.find((id) => id !== input.currentUserId);
  return { topics, checklist, canWrite: matchingAvailable && connection.status === "ACTIVE" && !connection.pairId, discordAvailable, discordConsent,
    ...(discordAvailable && discordConsent && partnerId && /^\d{5,30}$/.test(partnerId) ? { discordUrl: `https://discord.com/users/${partnerId}` } : {}),
  };
}

export type MatchingConversationCommand = {
  currentUserId: string;
  connectionId: string;
  action: "SUBMIT" | "WITHDRAW" | "DISCORD_CONSENT";
  topicKey?: string;
  round?: number;
  text?: string;
  revealConsent?: boolean;
  discordConsent?: boolean;
};

export async function authorizeMatchingConversationMutation(input: { currentUserId: string; connectionId: string; requireMatching?: boolean }): Promise<void> {
  await connectToDatabase();
  const connection = await ownedConnection(input.currentUserId, input.connectionId);
  if (connection.status !== "ACTIVE" || connection.pairId) return fail("MATCHING_CONNECTION_STATE_CONFLICT", 409, "Connection is not active");
  if (input.requireMatching) await assertMatchingSolo(connection.participantIds);
}

export async function updateMatchingConversation(input: MatchingConversationCommand): Promise<MatchingConversationDTO> {
  await connectToDatabase();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const connection = await ownedConnection(input.currentUserId, input.connectionId, session);
      if (connection.status !== "ACTIVE" || connection.pairId) return fail("MATCHING_CONNECTION_STATE_CONFLICT", 409, "Connection is not active");
      await mongoMatchingParticipantFencePort.fence({ participantIds: matchingParticipantIds(...connection.participantIds), session });
      if (input.action === "SUBMIT" || (input.action === "DISCORD_CONSENT" && input.discordConsent)) await assertMatchingSolo(connection.participantIds, session);
      // Serialize submissions, withdrawal, closure and Pair formation on the same connection revision.
      const fenced = await MatchingConnection.updateOne({ _id: connection._id, revision: connection.revision, status: "ACTIVE", pairId: { $exists: false } }, { $inc: { revision: 1 } }, { session });
      if (fenced.modifiedCount !== 1) return fail("MATCHING_CONNECTION_STATE_CONFLICT", 409, "Connection changed");
      if (input.action === "DISCORD_CONSENT") {
        if (input.discordConsent) {
          for (const key of ["boundaries", "mutual-interest"]) {
            const latest = await MatchingConversationRound.findOne({ connectionId: connection._id, topicKey: key }).sort({ round: -1 }).session(session).lean<MatchingConversationRoundType | null>();
            if (!latest?.revealedAt) return fail("MATCHING_READINESS_REQUIRED", 409, "Discuss boundaries and mutual interest first");
          }
        }
        await MatchingConnection.updateOne({ _id: connection._id }, input.discordConsent ? { $addToSet: { discordConsentBy: input.currentUserId } } : { $pull: { discordConsentBy: input.currentUserId } }, { session });
        return;
      }
      const topic = conversationTopics.find((item) => item.key === input.topicKey);
      if (!topic || !Number.isInteger(input.round) || (input.round ?? 0) < 1) return fail("VALIDATION_ERROR", 400, "Invalid conversation topic or round");
      const previous = await MatchingConversationRound.findOne({ connectionId: connection._id, topicKey: topic.key }).sort({ round: -1 }).select("+answers").session(session).lean<MatchingConversationRoundType | null>();
      if (input.action === "WITHDRAW") {
        if (!previous || previous.round !== input.round || previous.revealedAt) return fail("MATCHING_REVEAL_CONFLICT", 409, "A revealed answer cannot be withdrawn; start a new round");
        await MatchingConversationRound.updateOne({ _id: previous._id, revealedAt: { $exists: false } }, { $pull: { answers: { userId: input.currentUserId } } }, { session });
        return;
      }
      const text = input.text?.trim();
      if (input.revealConsent !== true || !text || text.length > 2000) return fail("VALIDATION_ERROR", 400, "Answer and explicit disclosure notice consent are required");
      const nextRound = previous?.revealedAt ? previous.round + 1 : previous?.round ?? 1;
      // Exact repeat remains idempotent after mutual disclosure, without creating a new round.
      if (previous?.revealedAt && input.round === previous.round && previous.answers.some((answer) => answer.userId === input.currentUserId && answer.text === text)) return;
      if (input.round !== nextRound) return fail("MATCHING_ROUND_CONFLICT", 409, "Conversation round changed; refresh it");
      if (!previous || previous.revealedAt) {
        await MatchingConversationRound.create([{ connectionId: connection._id, participantIds: connection.participantIds, topicKey: topic.key, round: nextRound, answers: [{ userId: input.currentUserId, text, submittedAt: new Date() }] }], { session });
        return;
      }
      const own = previous.answers.find((answer) => answer.userId === input.currentUserId);
      if (own) {
        if (own.text !== text) return fail("MATCHING_ANSWER_EXISTS", 409, "Withdraw your answer before replacing it");
        return;
      }
      const answers = [...previous.answers, { userId: input.currentUserId, text, submittedAt: new Date() }];
      if (answers.length > 2) return fail("MATCHING_DATA_INVALID", 500, "Invalid conversation participants");
      await MatchingConversationRound.updateOne({ _id: previous._id, revealedAt: { $exists: false } }, { $set: { answers, ...(answers.length === 2 ? { revealedAt: new Date() } : {}) } }, { session });
      if (answers.length === 2 && connection.stage === "MATCHED") await MatchingConnection.updateOne({ _id: connection._id }, { $set: { stage: "TALKING" } }, { session });
    });
  } finally { await session.endSession(); }
  return getMatchingConversation(input);
}
