/** Supported rollback starts a trusted prior release with both generations' assessment switches closed. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import mongoose from 'mongoose';
import { assessmentTargetId } from '@/domain/services/assessmentAccess.service';
import { setAssessmentStops } from '@/domain/services/assessmentOperations.service';

async function main() {
  const args = process.argv.slice(2), value = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  assert.ok(args.includes('--apply') && value('target-id') === assessmentTargetId(), 'BETA_EXPLICIT_TARGET_APPLY_REQUIRED');
  assert.ok(process.env.MONGODB_URI && value('release-dir') && value('entry'), 'BETA_ROLLBACK_RELEASE_REQUIRED');
  const release = await realpath(resolve(value('release-dir')!)), entry = await realpath(resolve(release, value('entry')!));
  const entryRelative = relative(release, entry), releaseRelative = relative(await realpath(process.cwd()), release);
  assert.ok((releaseRelative === '..' || releaseRelative.startsWith(`..${sep}`) || isAbsolute(releaseRelative)) && entryRelative && entryRelative !== '..' && !entryRelative.startsWith(`..${sep}`) && !isAbsolute(entryRelative) && (await stat(entry)).isFile(), 'BETA_ROLLBACK_ENTRY_OUTSIDE_RELEASE');
  await setAssessmentStops(['SUBMISSIONS', 'DISCLOSURE', 'MATCHING', 'PAIR', 'NOTIFICATIONS'], true);
  await mongoose.disconnect();
  // The retained pilot predates ASSESSMENT_MODE and durable stop controls. Its legacy flag must also be disabled.
  const environment: NodeJS.ProcessEnv = { ...process.env, ASSESSMENT_MODE: 'OFF', ASSESSMENT_SYNTHETIC_ENABLED: 'false', TSX_TSCONFIG_PATH: resolve(release, 'tsconfig.json') };
  delete environment.ASSESSMENT_BETA_APPROVALS_PATH;
  const child = spawn(process.execPath, [...(args.includes('--typescript') ? ['--import', 'tsx'] : []), entry], { cwd: release, env: environment, windowsHide: true, shell: false, stdio: 'inherit' });
  const stop = () => { if (child.exitCode === null) child.kill('SIGTERM'); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try { process.exitCode = await new Promise<number>(done => { child.once('error', () => done(1)); child.once('close', code => done(code ?? 1)); }); }
  finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
void main().catch(() => { process.stderr.write('BETA_ROLLBACK_FAILED\n'); process.exitCode = 1; }).finally(() => mongoose.disconnect());
