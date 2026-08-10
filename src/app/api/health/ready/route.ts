import { jsonError, jsonOk } from '@/lib/api/response';
import { validateRuntimeEnv } from '@/lib/config/runtimeEnv';
import { connectToDatabase } from '@/lib/mongodb';
import { recordOperationalEvent } from '@/lib/observability/operationalEvents';

export const dynamic = 'force-dynamic';

const READY_TIMEOUT_MS = 2_500;

const checkMongo = async (): Promise<void> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('readiness timeout')),
      READY_TIMEOUT_MS
    );
  });

  try {
    await Promise.race([
      connectToDatabase().then(async (connection) => {
        const database = connection.connection.db;
        if (!database) throw new Error('database unavailable');
        await database.admin().ping();
      }),
      timeout,
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export async function GET(): Promise<Response> {
  const startedAt = performance.now();
  const environment = validateRuntimeEnv();
  if (!environment.ok) {
    recordOperationalEvent({
      name: 'db_health_checked',
      routeGroup: 'health',
      outcome: 'error',
      durationMs: performance.now() - startedAt,
      code: 'ENV_INVALID',
    });
    const response = jsonError(503, 'NOT_READY', 'Service is not ready');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  try {
    await checkMongo();
    recordOperationalEvent({
      name: 'db_health_checked',
      routeGroup: 'health',
      outcome: 'ok',
      durationMs: performance.now() - startedAt,
    });
    const response = jsonOk({ status: 'ready' as const });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    recordOperationalEvent({
      name: 'db_health_checked',
      routeGroup: 'health',
      outcome: 'error',
      durationMs: performance.now() - startedAt,
      code: 'DB_UNAVAILABLE',
    });
    const response = jsonError(503, 'NOT_READY', 'Service is not ready');
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
