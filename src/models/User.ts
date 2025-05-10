// src/models/User.ts
import mongoose, { Document, Model } from 'mongoose';
import { DiscordUser } from '../store/useUserStore';

interface UserDoc extends DiscordUser, Document {}

const UserSchema = new mongoose.Schema<UserDoc>({
  id:       { type: String, required: true, unique: true },
  username: { type: String, required: true },
  avatar:   { type: String, required: true },
}, { timestamps: true });

export const User: Model<UserDoc> =
  mongoose.models.User || mongoose.model<UserDoc>('User', UserSchema);
