import mongoose from 'mongoose';

export interface UserType {
  id:       string;
  username: string;
  avatar:   string;
}

// Описываем схему именно по полям UserType
const userSchema = new mongoose.Schema<UserType>(
  {
    id:       { type: String, required: true, unique: true },
    username: { type: String, required: true },
    avatar:   { type: String, required: true },
  },
  { timestamps: true }
);

// Если модель уже создана (HMR / re-compile), берём её, иначе создаём
export const User =
  (mongoose.models.User as mongoose.Model<UserType>) ||
  mongoose.model<UserType>('User', userSchema);
