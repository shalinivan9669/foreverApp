import mongoose from 'mongoose';

declare global {
  // Кэшируем подключение в глобальной области, чтобы на переоткрытие HMR
  // не создавать каждый раз новый connection 
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

global.mongooseCache = global.mongooseCache || { conn: null, promise: null };

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (global.mongooseCache.conn) {
    return global.mongooseCache.conn;
  }
  if (!global.mongooseCache.promise) {
    global.mongooseCache.promise = mongoose
      .connect(process.env.MONGODB_URI!, {
        // по желанию: useNewUrlParser, useUnifiedTopology и т.д.
      })
      .then((m) => m);
  }
  global.mongooseCache.conn = await global.mongooseCache.promise;
  return global.mongooseCache.conn;
}
