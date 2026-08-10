// src/lib/mongodb.ts
import mongoose from 'mongoose';

let cachedConn: typeof mongoose | null = null;
let cachedPromise: Promise<typeof mongoose> | null = null;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cachedConn?.connection.readyState === 1) return cachedConn;
  if (cachedConn) {
    cachedConn = null;
    cachedPromise = null;
  }

  const mongodbUri = process.env.MONGODB_URI?.trim();
  if (!mongodbUri) {
    throw new Error('MONGODB_URI не определён в окружении');
  }

  if (!cachedPromise) {
    cachedPromise = mongoose.connect(mongodbUri, {
      autoIndex: false,
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      socketTimeoutMS: 15_000,
      maxPoolSize: 20,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
    });
  }

  try {
    cachedConn = await cachedPromise;
    return cachedConn;
  } catch (error) {
    cachedPromise = null;
    cachedConn = null;
    throw error;
  }
}
