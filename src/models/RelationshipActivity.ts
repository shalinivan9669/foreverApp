import mongoose, { Schema, Types } from 'mongoose';

export interface ActivityPayload {
  title: string;
  description?: string;
  dueAt?: Date;
}

export interface RelationshipActivityType {
  userId: Types.ObjectId;
  partnerId: Types.ObjectId;
  type: 'task' | 'reminder' | 'challenge';
  payload: ActivityPayload;
  status: 'pending' | 'completed';
  createdAt?: Date;
  updatedAt?: Date;
}

const payloadSchema = new Schema<ActivityPayload>(
  {
    title:       { type: String, required: true },
    description: { type: String },
    dueAt:       { type: Date },
  },
  { _id: false }
);

const relationshipActivitySchema = new Schema<RelationshipActivityType>(
  {
    userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    partnerId:{ type: Schema.Types.ObjectId, ref: 'User', required: true },
    type:     { type: String, enum: ['task','reminder','challenge'], required: true },
    payload:  { type: payloadSchema, required: true },
    status:   { type: String, enum: ['pending','completed'], default: 'pending' },
  },
  { timestamps: true }
);

// Legacy read-only collection kept for compatibility and migration.
relationshipActivitySchema.index({ userId: 1, partnerId: 1, status: 1, createdAt: -1 });

export const RelationshipActivity =
  (mongoose.models.RelationshipActivity as mongoose.Model<RelationshipActivityType>) ||
  mongoose.model<RelationshipActivityType>('RelationshipActivity', relationshipActivitySchema);
