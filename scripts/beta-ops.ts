import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessmentMode, assessmentTargetId, isAssessmentEnabled, isAssessmentEnvironment, readAssessmentBetaApproval } from '@/domain/services/assessmentAccess.service';
import { assessmentHealth, deliverAssessmentAlert, inviteAssessmentParticipant, migrateAssessmentAdditive, revokeAssessmentParticipant, setAssessmentStops, setAssessmentPublicationStop } from '@/domain/services/assessmentOperations.service';
import { recordAssessmentOps, retryAssessmentDeadLetter } from '@/domain/services/assessmentJobs.service';
import { resolveAssessmentSupport } from '@/domain/services/assessmentAdmission.service';
import { AssessmentSupport, AssessmentRuntimeControl, type AssessmentEffect } from '@/models/AssessmentOperations';
import { connectToDatabase } from '@/lib/mongodb';

const args = process.argv.slice(2);
const flag = (name: string) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
function requireTargetMutation(control = false): void {
  if (!args.includes('--apply') || flag('target-id') !== assessmentTargetId()) throw new Error('BETA_EXPLICIT_TARGET_APPLY_REQUIRED');
  if (control) return; // Explicit operator stop/revoke/privacy access remains available after rollout approval expires or OFF.
  if (!isAssessmentEnvironment() && !readAssessmentBetaApproval()) throw new Error('BETA_APPROVAL_REQUIRED');
}
async function main() {
  const command = args[0] ?? 'health';
  if (!process.env.MONGODB_URI) throw new Error('BETA_TARGET_REQUIRED');
  if (command === 'identity') { process.stdout.write(`${JSON.stringify({ targetId: assessmentTargetId(), mode: assessmentMode() })}\n`); return; }
  await connectToDatabase();
  if (command === 'health' || command === 'preflight') { process.stdout.write(`${JSON.stringify(await assessmentHealth())}\n`); if (command === 'preflight' && assessmentMode() === 'PRIVATE_BETA' && !isAssessmentEnabled()) process.exitCode = 2; return; }
  if (command === 'migrate') { const apply = args.includes('--apply'); if (apply) requireTargetMutation(); process.stdout.write(`${JSON.stringify(await migrateAssessmentAdditive(apply))}\n`); return; }
  requireTargetMutation(['stop', 'stop-publication', 'revoke', 'support-list', 'support-read', 'support-resolve', 'test-alert'].includes(command));
  if (command === 'initialize-empty') {
    if (await mongoose.connection.db!.collection('assessment_participants').countDocuments({})) throw new Error('BETA_TARGET_NOT_EMPTY');
    await AssessmentRuntimeControl.updateOne({ _id: assessmentTargetId() }, { $set: { recoveryReconciled: true }, $inc: { revision: 1 } });
  } else if (command === 'invite') {
    if (!flag('subject') || !flag('cohort')) throw new Error('BETA_INVITE_ARGUMENTS_REQUIRED');
    await inviteAssessmentParticipant(flag('subject')!, flag('cohort')!);
  } else if (command === 'revoke') {
    if (!flag('subject')) throw new Error('BETA_SUBJECT_REQUIRED'); await revokeAssessmentParticipant(flag('subject')!);
  } else if (command === 'stop' || command === 'resume') {
    const values = (flag('effects') ?? 'SUBMISSIONS,DISCLOSURE,MATCHING,PAIR,NOTIFICATIONS').split(',');
    const allowed: AssessmentEffect[] = ['SUBMISSIONS', 'DISCLOSURE', 'MATCHING', 'PAIR', 'NOTIFICATIONS'];
    if (values.some(value => !allowed.some(effect => effect === value))) throw new Error('BETA_EFFECT_INVALID');
    await setAssessmentStops(values as AssessmentEffect[], command === 'stop');
  } else if (command === 'retry-job') {
    if (!flag('job')) throw new Error('BETA_JOB_REQUIRED'); await retryAssessmentDeadLetter(flag('job')!);
  } else if (command === 'stop-publication' || command === 'resume-publication') {
    if (!flag('publication')) throw new Error('BETA_PUBLICATION_REQUIRED');
    await setAssessmentPublicationStop(flag('publication')!, command === 'stop-publication');
  } else if (command === 'test-alert') {
    if (await deliverAssessmentAlert(['OPERATOR_TEST']) !== 'SENT') throw new Error('BETA_ALERT_NOT_DELIVERED');
  } else if (command === 'support-list') {
    const rows = await AssessmentSupport.find({ status: 'OPEN' }).sort({ createdAt: 1 }).limit(50).select({ _id: 1, category: 1, createdAt: 1, status: 1 }).lean();
    process.stdout.write(`${JSON.stringify({ tickets: rows })}\n`); await recordAssessmentOps('SUPPORT_LIST_READ', 'OPERATOR'); return;
  } else if (command === 'support-read') {
    if (!flag('ticket') || !flag('output')) throw new Error('BETA_SUPPORT_PRIVATE_OUTPUT_REQUIRED');
    const row = await AssessmentSupport.findById(flag('ticket')).lean(); if (!row) throw new Error('BETA_TICKET_UNAVAILABLE');
    await writeFile(resolve(flag('output')!), JSON.stringify({ id: row._id, category: row.category, message: row.message, attachment: row.attachment, createdAt: row.createdAt }), { flag: 'wx', mode: 0o600 });
    await recordAssessmentOps('SUPPORT_TICKET_READ', 'OPERATOR');
  } else if (command === 'support-resolve') {
    if (!flag('ticket')) throw new Error('BETA_TICKET_REQUIRED'); await resolveAssessmentSupport(flag('ticket')!);
  } else throw new Error('BETA_COMMAND_INVALID');
  process.stdout.write(`${JSON.stringify({ command, completed: true })}\n`);
}
main().catch(error => { process.stderr.write(`${error instanceof Error && /^BETA_[A-Z_]+$/.test(error.message) ? error.message : 'BETA_OPS_FAILED'}\n`); process.exitCode = 1; }).finally(() => mongoose.disconnect());
