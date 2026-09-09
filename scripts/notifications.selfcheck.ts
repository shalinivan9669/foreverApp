import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Types } from "mongoose";
import { toNotificationDTO } from "@/lib/dto/notification.dto";
import { resolveActivityNotificationTarget } from '@/client/viewmodels/notificationTargets';
import { toActivityCardVM } from '@/client/viewmodels/activity.viewmodels';
import { findNotificationHistoryItem } from '@/client/api/notificationHistory';
import { pairHistoryApi } from '@/client/api/pairHistory.api';
import type { PairActivityDTO } from '@/client/api/types';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ActivityCard from '@/components/activities/ActivityCard';

const source = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

const createdAt = new Date("2026-08-07T12:00:00.000Z");
const dto = toNotificationDTO({
  _id: "64f000000000000000000001",
  userId: "member-a",
  pairId: new Types.ObjectId("64f000000000000000000002"),
  resourceId: "64f000000000000000000005",
  type: "SUMMARY_READY",
  dedupeKey: "a".repeat(64),
  expiresAt: new Date("2027-02-03T12:00:00.000Z"),
  createdAt,
  updatedAt: createdAt,
});
assert.equal(dto.type, "SUMMARY_READY");
assert.equal(dto.isRead, false);
assert.equal(dto.createdAt, createdAt.toISOString());
assert.equal(dto.action.href, "/pair/64f000000000000000000002?cycleId=64f000000000000000000005&action=summary#weekly-checkin");
assert.match(dto.title, /Общий результат готов/i);
assert.doesNotMatch(dto.title, /ответ|оценк|тема/i);
assert.doesNotMatch(dto.message, /ответ партн|безопасност|интим/i);

const matchingDto = toNotificationDTO({
  _id: "64f000000000000000000003",
  userId: "member-b",
  resourceId: "64f000000000000000000004",
  type: "MATCH_LIKE_RECEIVED",
  dedupeKey: "b".repeat(64),
  expiresAt: new Date("2027-02-03T12:00:00.000Z"),
  createdAt,
  updatedAt: createdAt,
});
assert.equal(matchingDto.action.href, "/match/inbox");
assert.match(matchingDto.title, /знакомство/i);
assert.doesNotMatch(matchingDto.message, /процент|оценк|фактор/i);

const model = source("src/models/Notification.ts");
assert.ok(model.includes("notification_user_dedupe"));
assert.ok(model.includes("expireAfterSeconds: 0"));
assert.ok(model.includes("{ userId: 1, createdAt: -1, _id: -1 }"));

const service = source("src/domain/services/notification.service.ts");
assert.ok(service.includes("createHash('sha256')"));
assert.ok(service.includes("$setOnInsert"));
assert.ok(service.includes("upsert: true"));
assert.ok(service.includes(".limit(limit + 1)"));
assert.ok(service.includes("$answers.by"), 'current own feedback presence is projected separately from stored completion');
assert.ok(!service.includes('$answers.ui'), 'notification reads must not load response values');
assert.ok(!service.includes("notes"));
assert.ok(!service.includes("inviteToken"));

for (const route of [
  "src/app/api/notifications/route.ts",
  "src/app/api/notifications/[id]/read/route.ts",
]) {
  const routeSource = source(route);
  assert.ok(routeSource.includes("requireSession(req)"));
  assert.ok(!routeSource.includes("userId: query"));
  assert.ok(!routeSource.includes("userId: body"));
}

assert.ok(
  source("src/domain/services/pairFormation.service.ts").includes(
    "type: 'PAIR_JOINED'",
  ),
);
const cycleService = source("src/domain/services/weeklyCycle.service.ts");
assert.ok(cycleService.includes("type: 'CYCLE_AVAILABLE'"));
assert.ok(cycleService.includes("type: 'SUMMARY_READY'"));
assert.ok(
  source("src/domain/services/recommendationDecision.service.ts").includes(
    "type: 'ACTION_AVAILABLE'",
  ),
);
assert.ok(
  source("src/domain/services/activities.service.ts").includes(
    "type: 'FEEDBACK_REQUESTED'",
  ),
);
const matchingApplication = source(
  "src/domain/services/matching/matchingApplication.service.ts",
);
assert.match(
  matchingApplication,
  /LIKE_CREATED:\s*["']MATCH_LIKE_RECEIVED["']/,
);
assert.match(matchingApplication, /["']matching-notification-v1["']/);
assert.match(source("src/app/main-menu/page.tsx"), /<NotificationPanel\b/);
const notificationPanel = source(
  "src/components/notifications/NotificationPanel.tsx",
);
assert.ok(notificationPanel.includes("loadFailed"));
assert.ok(notificationPanel.includes("Повторить"));

const storedFeedback = {
  _id: '64f000000000000000000009', userId: 'member-a',
  pairId: new Types.ObjectId('64f000000000000000000002'),
  resourceId: '64f000000000000000000006', type: 'FEEDBACK_REQUESTED' as const,
  dedupeKey: 'd'.repeat(64), expiresAt: createdAt, createdAt, updatedAt: createdAt,
};
assert.match(toNotificationDTO(storedFeedback).action.href, /activityId=64f000000000000000000006&action=feedback$/);
assert.match(toNotificationDTO(storedFeedback, { resourceState: 'waiting' }).action.href, /action=result$/);
assert.equal(toNotificationDTO(storedFeedback, { resourceState: 'completed' }).isRead, false, 'completing a task does not mark a notice read');
assert.equal(toNotificationDTO({ ...storedFeedback, readAt: createdAt }).action.label, 'Оставить личный отзыв', 'reading does not complete the task');
assert.match(toNotificationDTO(storedFeedback, { pairStatus: 'ended' }).message, /прежней или недоступной паре/);
assert.equal(toNotificationDTO(storedFeedback, { pairStatus: 'paused' }).action.href, '/pair/64f000000000000000000002');
assert.match(toNotificationDTO({ ...storedFeedback, resourceId: undefined }).message, /без ссылки на конкретную запись/);
assert.match(toNotificationDTO(storedFeedback, { resourceState: 'missing' }).message, /больше недоступна/);

const partialActivity: PairActivityDTO = {
  id: storedFeedback.resourceId, pairId: String(storedFeedback.pairId),
  title: { ru: 'Тестовый шаг', en: 'Test' }, why: { ru: 'Тест', en: 'Test' },
  intent: 'improve', archetype: 'dialogue', mode: 'together', sync: 'async',
  difficulty: 1, intensity: 1, targetFactorKeys: [], status: 'completed_partial', checkIns: [],
  resultSummary: { dataStatus: 'PARTIAL', bothSubmitted: false, status: 'completed_partial', resultVersion: 'activity-result-v2', evidenceStatus: 'RECORDED' },
};
const target = toActivityCardVM(partialActivity);
assert.deepEqual(resolveActivityNotificationTarget({ action: 'feedback', activity: target, feedbackSubmitted: false }), { tab: 'history', openFeedback: true, message: null });
assert.equal(resolveActivityNotificationTarget({ action: 'feedback', activity: target, feedbackSubmitted: true }).openFeedback, false);
assert.equal(resolveActivityNotificationTarget({ action: 'result', activity: target }).openFeedback, false);
assert.equal(resolveActivityNotificationTarget({ action: 'feedback', activity: { ...target, status: 'cancelled' } }).openFeedback, false);
assert.equal(resolveActivityNotificationTarget({ action: 'feedback', activity: null }).openFeedback, false);
assert.equal(resolveActivityNotificationTarget({ action: 'feedback', activity: toActivityCardVM({ ...partialActivity, resultSummary: { ...partialActivity.resultSummary!, bothSubmitted: true } }) }).openFeedback, false);
const renderActivity = (submitted: boolean, variant: 'active' | 'history') => renderToStaticMarkup(createElement(ActivityCard, {
  activity: { ...target, feedbackSubmitted: submitted, status: variant === 'active' ? 'awaiting_feedback' : 'completed_partial' },
  variant, locale: 'ru', onAccept() {}, onCancel() {}, onStart() {}, onComplete() {},
}));
assert.ok(!renderActivity(true, 'history').includes('Добавить или обновить отзыв'), 'an already answered history card must not solicit repeated feedback');
assert.ok(renderActivity(false, 'history').includes('Добавить или обновить отзыв'), 'the missing participant must retain a feedback action');
assert.ok(!renderActivity(true, 'active').includes('Оставить отзыв / завершить'), 'an already answered current card must not solicit repeated feedback');
assert.ok(renderActivity(true, 'active').includes('Завершить с сохранённым отзывом'), 'reload after saving feedback must leave a completion path without resubmitting answers');
assert.ok(renderActivity(false, 'active').includes('Оставить отзыв / завершить'));

async function checkHistoryTraversal() {
  const original = pairHistoryApi.list;
  const calls: string[] = [];
  try {
    pairHistoryApi.list = async (pairId, options = {}) => {
      assert.ok((options.limit ?? 12) <= 20, 'the real guarded history endpoint rejects limits above 20');
      calls.push(options.cursor ?? 'first');
      return options.cursor ? { pairId, nextCursor: null, items: [{ kind: 'activity', id: target._id, date: createdAt.toISOString(), title: 'Тест', status: 'completed_partial', feedbackSubmitted: true }] }
        : { pairId, nextCursor: 'page-2', items: [] };
    };
    const found = await findNotificationHistoryItem('pair', 'activity', target._id, new AbortController().signal);
    assert.equal(found?.kind === 'activity' && found.feedbackSubmitted, true);
    assert.deepEqual(calls, ['first', 'page-2']);
    const aborted = new AbortController(); aborted.abort();
    assert.equal(await findNotificationHistoryItem('pair', 'activity', target._id, aborted.signal), null);
    assert.equal(calls.length, 2, 'aborted target must not load or expose a historical record');
    pairHistoryApi.list = async () => { throw new Error('401'); };
    await assert.rejects(findNotificationHistoryItem('pair', 'activity', target._id, new AbortController().signal), /401/);
  } finally { pairHistoryApi.list = original; }
}
void checkHistoryTraversal().then(() => console.log('notifications selfcheck passed')).catch(() => { console.error('notifications target regression failed'); process.exitCode = 1; });
