import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { assessmentMode, isAssessmentEnabled, isAssessmentEnvironment } from '@/domain/services/assessmentAccess.service';
import { runAssessmentWorkerBatch, recordAssessmentOps } from '@/domain/services/assessmentJobs.service';
import { assessmentHealth, deliverAssessmentAlert, purgeAssessmentExpired } from '@/domain/services/assessmentOperations.service';

/** Runnable self-hosted trigger. Restart this process with the deployment's existing process supervisor. */
async function main() {
  if (assessmentMode() === 'PRIVATE_BETA' && !isAssessmentEnabled()) throw new Error('BETA_APPROVAL_REQUIRED');
  if (assessmentMode() === 'SYNTHETIC' && !isAssessmentEnvironment()) throw new Error('BETA_SYNTHETIC_TARGET_REQUIRED');
  const once = process.argv.includes('--once'); const abort = new AbortController(); const workerId = randomUUID();
  const stop = () => abort.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let lastAlert = ''; let lastAlertAt = 0;
  try {
    do {
      const result = await runAssessmentWorkerBatch(workerId);
      await purgeAssessmentExpired();
      if (isAssessmentEnabled()) {
        const { processAssessmentReminders } = await import('@/domain/services/assessmentReminders.service');
        await processAssessmentReminders(new Date(), 100);
      }
      await recordAssessmentOps('WORKER_HEARTBEAT', 'WORKER');
      const health = await assessmentHealth();
      const signature = health.alerts.join('|');
      if (signature && (signature !== lastAlert || Date.now() - lastAlertAt > 300000)) { await deliverAssessmentAlert(health.alerts); lastAlert = signature; lastAlertAt = Date.now(); }
      process.stdout.write(`${JSON.stringify({ worker: 'beta-worker-v1', claimed: result.claimed, completed: result.completed, queueDepth: health.pending, alerts: health.alerts })}\n`);
      if (!once && !abort.signal.aborted) await delay(5000, undefined, { signal: abort.signal }).catch(() => undefined);
    } while (!once && !abort.signal.aborted);
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); await mongoose.disconnect(); }
}
main().catch(() => { process.stderr.write('BETA_WORKER_FAILED\n'); process.exitCode = 1; });
