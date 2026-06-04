// src/lib/mongodb.ts
import mongoose from 'mongoose';

let cachedConn: typeof mongoose | null = null;
let cachedPromise: Promise<typeof mongoose> | null = null;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cachedConn) return cachedConn;

  const mongodbUri = process.env.MONGODB_URI?.trim();
  if (!mongodbUri) {
    throw new Error('MONGODB_URI не определён в окружении');
  }

  if (!cachedPromise) {
    cachedPromise = mongoose.connect(mongodbUri).then((m) => m);
  }

  cachedConn = await cachedPromise;
  return cachedConn;
}
