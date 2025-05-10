// src/models/Log.ts
import mongoose from 'mongoose';

export interface LogType {
  userId: string;
  at:     Date;
}

const logSchema = new mongoose.Schema<LogType>(
  {
    userId: { type: String, required: true },
    at:     { type: Date,   required: true },
  },
  { timestamps: false }
);

export const Log =
  mongoose.models.Log ||
  mongoose.model<LogType>('Log', logSchema);
