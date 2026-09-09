import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { Pair } from '@/models/Pair';
import { PairMembershipClaim } from '@/models/PairMembershipClaim';
import { PairActivity, type PairActivityType } from '@/models/PairActivity';
import { User } from '@/models/User';
import { SYSTEM_ACTIVITY_TEMPLATES } from '@/domain/services/pairActivityDecision.service';
import { activitiesService } from '@/domain/services/activities.service';
import { weeklyCycleService } from '@/domain/services/weeklyCycle.service';
import { notificationService } from '@/domain/services/notification.service';
import { pairActivityReadService } from '@/domain/services/pairActivityRead.service';
import { sessionRevocationService } from '@/domain/services/sessionRevocation.service';
import { signJwt } from '@/lib/jwt';
import { NextRequest } from 'next/server';
import { GET as getActivities } from '@/app/api/pairs/[id]/activities/route';
import type { ApiSuccessEnvelope } from '@/lib/api/response';
import type { PairActivityDTO } from '@/lib/dto/activity.dto';

export async function seedLocalAcceptanceNotifications(subjects: { a: string; b: string }): Promise<void> {
  const uri = new URL(process.env.MONGODB_URI ?? '');
  assert.equal(uri.hostname, '127.0.0.1');
  assert.match(uri.pathname, /^\/vmeste_local_[a-f0-9]{12}_test$/);
  assert.ok(Object.values(subjects).every((id) => /^local-acceptance-[a-f0-9]{12}-[ab]$/.test(id)));
  const members: [string, string] = [subjects.a, subjects.b];
  const users = await User.find({ id: { $in: members } }).select({ _id: 1, id: 1 }).lean<Array<{ _id: Types.ObjectId; id: string }>>();
  const a = users.find((user) => user.id === subjects.a);
  const b = users.find((user) => user.id === subjects.b);
  assert.ok(a && b);
  const pair = await Pair.create({ members, key: members.join('|'), status: 'active', contextVersion: 'pair-context-v1' });
  await PairMembershipClaim.insertMany(members.map((userId) => ({ userId, pairId: pair._id, pairKey: pair.key, source: 'PAIR_INVITE', sourceId: String(new Types.ObjectId()) })));
  await User.updateMany({ id: { $in: members } }, { $set: { 'personal.relationshipStatus': 'in_relationship' } });
  await weeklyCycleService.current({ pair, currentUserId: subjects.a });
  const template = SYSTEM_ACTIVITY_TEMPLATES[0];
  assert.ok(template);
  const now = new Date();
  const fixture: PairActivityType = {
    pairId: pair._id, members: [a._id, b._id], intent: template.intent,
    archetype: template.archetype, actionDefinition: { ...template.actionDefinition },
    targetFactorKeys: [...template.targetFactorKeys], title: { ru: template.title.ru, en: template.title.en },
    description: template.description ? { ru: template.description.ru, en: template.description.en } : undefined,
    why: { ...template.why }, mode: template.mode, sync: template.sync,
    difficulty: template.difficulty, intensity: template.intensity,
    offeredAt: now, startedAt: now, dueAt: new Date(now.getTime() + 3 * 86400000),
    status: 'in_progress', lifecycleVersion: 'activity-lifecycle-v3', feedbackSchemaVersion: 'activity-feedback-v2',
    requiresConsent: template.requiresConsent, visibility: template.visibility,
    checkIns: template.checkIns.map((item) => ({ ...item, map: [...item.map], text: { ...item.text } })),
    createdBy: 'system',
  };
  const activity = await PairActivity.create(fixture);
  const auditRequest = { route: '/local-acceptance/notifications', method: 'TEST' };
  await activitiesService.checkinActivity({ activityId: String(activity._id), currentUserId: subjects.a,
    answers: activity.checkIns.map((item) => ({ checkInId: item.id, ui: item.map.length })),
    allowPairModelUse: true, auditRequest });
  await activitiesService.completeActivity({ activityId: String(activity._id), currentUserId: subjects.a, auditRequest });
  // The addressed partial record deliberately falls outside the existing scan
  // and 50-row list cap. These synthetic cancelled rows contain no feedback.
  await PairActivity.insertMany(Array.from({ length: 205 }, (_, index) => ({
    ...fixture, status: 'cancelled', title: { ru: 'Завершённая тестовая запись', en: 'Archived test' },
    createdAt: new Date(now.getTime() + index + 1), offeredAt: new Date(now.getTime() + index + 1),
  })));
  const current = await PairActivity.create({ ...fixture, title: { ru: 'Текущая проверка отзыва', en: 'Current feedback test' } });
  await activitiesService.checkinActivity({ activityId: String(current._id), currentUserId: subjects.a,
    answers: current.checkIns.map((item) => ({ checkInId: item.id, ui: item.map.length })), allowPairModelUse: true, auditRequest });
  assert.equal(current.resultSummary, undefined);
  await notificationService.create({ userIds: [subjects.a], pairId: String(pair._id), type: 'FEEDBACK_REQUESTED', sourceKey: `activity:${String(current._id)}`, resourceId: String(current._id) });
  // Actor A verifies that an already completed personal task never reopens a form.
  await notificationService.create({ userIds: [subjects.a], pairId: String(pair._id), type: 'FEEDBACK_REQUESTED', sourceKey: `activity:${String(activity._id)}`, resourceId: String(activity._id) });
  const oldPair = await Pair.create({ members, key: members.join('|'), status: 'ended', contextVersion: 'pair-context-v1', endedAt: now });
  await notificationService.create({ userIds: members, pairId: String(oldPair._id), type: 'PAIR_JOINED', sourceKey: 'local-ended-pair' });
  await notificationService.create({ userIds: members, pairId: String(pair._id), type: 'FEEDBACK_REQUESTED', sourceKey: 'local-missing-activity', resourceId: String(new Types.ObjectId()) });
  const capped = await pairActivityReadService.list({ pairId: pair._id, currentUserId: subjects.b, role: 'B', status: 'history' });
  assert.ok(!capped.some((item) => item.id === String(activity._id)), 'old target must fall outside the capped history fixture');
  const ownCurrent = await pairActivityReadService.list({ pairId: pair._id, currentUserId: subjects.a, role: 'A', activityId: current._id });
  assert.equal(ownCurrent[0]?.feedbackSubmitted, true, 'current own feedback is known before resultSummary exists');
  const peerCurrent = await pairActivityReadService.list({ pairId: pair._id, currentUserId: subjects.b, role: 'B', activityId: current._id });
  assert.equal(peerCurrent[0]?.feedbackSubmitted, false, 'peer feedback does not count as own feedback');
  const secret = process.env.JWT_SECRET;
  assert.ok(secret);
  const version = await sessionRevocationService.getOrCreateVersion(subjects.b);
  const cookie = `session=${signJwt(subjects.b, secret, 600, version)}`;
  const addressed = await getActivities(new NextRequest(`http://localhost/api/pairs/${String(pair._id)}/activities?activityId=${String(activity._id)}`, { headers: { cookie } }), { params: Promise.resolve({ id: String(pair._id) }) });
  assert.equal(addressed.status, 200);
  const body = await addressed.json() as ApiSuccessEnvelope<PairActivityDTO[]>;
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].id, String(activity._id));
  assert.equal(body.data[0].feedbackSubmitted, false);
  assert.ok(!JSON.stringify(body).includes('"answers"'));
  const foreign = await Pair.create({ members: [`${subjects.a}-other`, `${subjects.b}-other`], key: 'local-foreign', status: 'active', contextVersion: 'pair-context-v1' });
  const foreignAccess = await getActivities(new NextRequest(`http://localhost/api/pairs/${String(foreign._id)}/activities?activityId=${String(activity._id)}`, { headers: { cookie } }), { params: Promise.resolve({ id: String(foreign._id) }) });
  assert.equal(foreignAccess.status, 404);
  const unauthenticated = await getActivities(new NextRequest(`http://localhost/api/pairs/${String(pair._id)}/activities?activityId=${String(activity._id)}`), { params: Promise.resolve({ id: String(pair._id) }) });
  assert.equal(unauthenticated.status, 401);
  const invalid = await getActivities(new NextRequest(`http://localhost/api/pairs/${String(pair._id)}/activities?activityId=invalid`, { headers: { cookie } }), { params: Promise.resolve({ id: String(pair._id) }) });
  assert.equal(invalid.status, 400);
  const privateActivity = await PairActivity.create({ ...fixture, visibility: 'privateA', status: 'completed_partial' });
  const hidden = await pairActivityReadService.list({ pairId: pair._id, currentUserId: subjects.b, role: 'B', activityId: privateActivity._id });
  assert.deepEqual(hidden, []);
  assert.deepEqual(await pairActivityReadService.list({ pairId: foreign._id, currentUserId: subjects.b, role: 'B', activityId: activity._id }), []);
  const page = await notificationService.list({ currentUserId: subjects.b });
  assert.ok(page.items.some((item) => item.action.href.includes(`activityId=${String(activity._id)}`)));
  assert.ok(page.items.some((item) => item.message.includes('прежней или недоступной паре')));
  const ownerNotices = await notificationService.list({ currentUserId: subjects.a });
  assert.ok(ownerNotices.items.some((item) => item.action.href.includes(`activityId=${String(current._id)}&action=result`)));
}
