import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { assessmentTargetId, isAssessmentEnvironment, readAssessmentBetaApproval } from '@/domain/services/assessmentAccess.service';
import { BetaBackupSchema, captureBetaBackup, restoreBetaBackup } from './lib/beta-restore';

const args = process.argv.slice(2); const flag = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
async function main() {
  if (flag('target-id') !== assessmentTargetId() || !args.includes('--apply') || !flag('path')) throw new Error('BETA_EXPLICIT_TARGET_APPLY_REQUIRED');
  if (!isAssessmentEnvironment() && !readAssessmentBetaApproval()) throw new Error('BETA_TARGET_GUARD_FAILED');
  const path = resolve(flag('path')!);
  if (args[0] === 'backup') {
    const backup = await captureBetaBackup(); await writeFile(path, JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ backup: 'CREATED', targetId: backup.sourceTargetId, collections: backup.collections.length, createdAt: backup.createdAt })}\n`);
  } else if (args[0] === 'restore') {
    const bytes = await readFile(path, 'utf8'); if (bytes.length > 100000000) throw new Error('BETA_BACKUP_SIZE_LIMIT');
    const backup = BetaBackupSchema.parse(JSON.parse(bytes));
    process.stdout.write(`${JSON.stringify({ restore: 'RECONCILED_STOPPED', ...await restoreBetaBackup(backup) })}\n`);
  } else throw new Error('BETA_RESTORE_COMMAND_INVALID');
}
main().catch(error => { process.stderr.write(`${error instanceof Error && /^BETA_[A-Z_]+$/.test(error.message) ? error.message : 'BETA_RESTORE_FAILED'}\n`); process.exitCode = 1; }).finally(() => mongoose.disconnect());
