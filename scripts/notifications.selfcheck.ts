import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Types } from "mongoose";
import { toNotificationDTO } from "@/lib/dto/notification.dto";

const source = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

const createdAt = new Date("2026-08-07T12:00:00.000Z");
const dto = toNotificationDTO({
  _id: "64f000000000000000000001",
  userId: "member-a",
  pairId: new Types.ObjectId("64f000000000000000000002"),
  type: "SUMMARY_READY",
  dedupeKey: "a".repeat(64),
  expiresAt: new Date("2027-02-03T12:00:00.000Z"),
  createdAt,
  updatedAt: createdAt,
});
assert.equal(dto.type, "SUMMARY_READY");
assert.equal(dto.isRead, false);
assert.equal(dto.createdAt, createdAt.toISOString());
assert.equal(dto.action.href, "/main-menu");
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
assert.ok(!service.includes("answers"));
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

console.log("notifications selfcheck passed");
