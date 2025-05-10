// src/lib/mongodb.ts
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  throw new Error('⚠️ MONGODB_URI не определён в окружении');
}

let cachedConn: typeof mongoose | null = null;
let cachedPromise: Promise<typeof mongoose> | null = null;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cachedConn) return cachedConn;

  if (!cachedPromise) {
    // теперь мы явно говорим TS: здесь MONGODB_URI точно строка
    cachedPromise = mongoose
      .connect(MONGODB_URI!)         // ← non-null assertion
      .then((m) => m);
  }

  cachedConn = await cachedPromise;
  return cachedConn;
}
