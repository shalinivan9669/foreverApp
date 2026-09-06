import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import next from 'next';

// A child of local-acceptance.ts, not an application entrypoint. Each process
// serves one exact browser hostname so Next constructs the genuine request URL
// with that origin while its TCP listener remains strictly on IPv4 loopback.
async function main(): Promise<void> {
  const [actor, rawPort] = process.argv.slice(2);
  if ((actor !== 'a' && actor !== 'b') || !/^\d+$/.test(rawPort ?? '') || process.argv.length !== 4) {
    throw new Error('LOCAL_ACCEPTANCE_SERVER_ARGUMENTS');
  }
  const port = Number(rawPort);
  if (port < 1024 || port > 65535 || process.env.NODE_ENV !== 'production') throw new Error('LOCAL_ACCEPTANCE_SERVER_ENVIRONMENT');
  const database = new URL(process.env.MONGODB_URI ?? '');
  const runId = /^\/vmeste_local_([a-f0-9]{12})_test$/.exec(database.pathname)?.[1];
  if (!runId || database.protocol !== 'mongodb:' || database.hostname !== '127.0.0.1'
    || database.searchParams.get('replicaSet') !== `vmesteLocal${runId}`) throw new Error('LOCAL_ACCEPTANCE_SERVER_DATABASE');
  const workspace = fileURLToPath(new URL('../', import.meta.url));
  for (const file of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    try { await access(join(workspace, file)); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error('LOCAL_ACCEPTANCE_ENV_FILE_PRESENT');
  }
  const hostname = `vmeste-${actor}.localhost`;
  const application = next({ dev: false, dir: workspace, hostname, port, quiet: true });
  await application.prepare();
  const handle = application.getRequestHandler();
  const server = createServer((request, response) => {
    if (request.headers.host !== `${hostname}:${port}`) {
      response.writeHead(421, { 'Cache-Control': 'no-store' }).end(); return;
    }
    // Preserve Host, Origin and all application auth/CSRF checks unchanged.
    void handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  process.stdout.write(`LOCAL_ACCEPTANCE_NEXT_READY:${actor}\n`);
  const close = () => {
    server.close(() => { void application.close().finally(() => process.exit(0)); });
    server.closeIdleConnections();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

void main().catch((error: Error) => {
  const reason = /^LOCAL_ACCEPTANCE_[A-Z_]+$/.test(error.message) ? error.message : 'LOCAL_ACCEPTANCE_SERVER_START_FAILED';
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
