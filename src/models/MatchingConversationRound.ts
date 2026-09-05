import mongoose, { Schema, Types } from "mongoose";
import type { ConversationAnswer } from "@/domain/model/matching/conversation";

export interface MatchingConversationRoundType {
  _id: Types.ObjectId;
  connectionId: Types.ObjectId;
  participantIds: [string, string];
  topicKey: string;
  round: number;
  answers: ConversationAnswer[];
  revealedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<ConversationAnswer>({
  userId: { type: String, required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  submittedAt: { type: Date, required: true },
}, { _id: false });
const schema = new Schema<MatchingConversationRoundType>({
  connectionId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: "MatchingConnection" },
  participantIds: { type: [String], required: true, immutable: true },
  topicKey: { type: String, required: true, immutable: true },
  round: { type: Number, required: true, min: 1, immutable: true },
  answers: { type: [answerSchema], default: [], select: false },
  revealedAt: { type: Date },
}, { collection: "matching_conversation_rounds", timestamps: true, versionKey: false });
schema.index({ connectionId: 1, topicKey: 1, round: -1 }, { unique: true, name: "matching_conversation_round_unique" });
schema.index({ participantIds: 1, createdAt: -1 }, { name: "matching_conversation_participant" });
export const MatchingConversationRound = (mongoose.models.MatchingConversationRound as mongoose.Model<MatchingConversationRoundType>) || mongoose.model<MatchingConversationRoundType>("MatchingConversationRound", schema);
