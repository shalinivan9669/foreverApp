import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { POST as saveWorkspaceRoute } from "@/app/api/pairs/[id]/shared-life/route";
import { POST as startDevelopmentRoute } from "@/app/api/development/start/route";
import { POST as completeDevelopmentRoute } from "@/app/api/development/complete/route";
import { signJwt } from "@/lib/jwt";
import { sessionRevocationService } from "@/domain/services/sessionRevocation.service";
import { privacySubjectHash } from "@/lib/privacy/subjectHash";
import { IdempotencyRecord } from "@/models/IdempotencyRecord";
import { SessionSubject } from "@/models/SessionSubject";
import type { JsonValue } from "@/lib/api/response";
import { parseMatchingTestDatabaseUri } from "./lib/matching-test-database";
import { connectToDatabase } from "@/lib/mongodb";
import { developmentService } from "@/domain/services/development.service";
import { sharedLifeService } from "@/domain/services/sharedLife.service";
import { economyService } from "@/domain/services/economy.service";
import { productWorkspacePrivacy } from "@/domain/services/productWorkspacePrivacy.service";
import { DomainError } from "@/domain/errors";
import { User } from "@/models/User";
import { Pair } from "@/models/Pair";
import { DevelopmentRun } from "@/models/DevelopmentRun";
import { DevelopmentCompletion } from "@/models/DevelopmentCompletion";
import { PairWorkspace } from "@/models/PairWorkspace";
import { EconomyWallet } from "@/models/EconomyWallet";
import { EconomyInventory } from "@/models/EconomyInventory";
import { EconomyLedger } from "@/models/EconomyLedger";
import { sharedLifeEntrySchema } from "@/lib/contracts/sharedLife";

const target = parseMatchingTestDatabaseUri(process.env.MONGODB_URI);
const parsedUri = new URL(target.uri);
if (
  target.protocol !== "mongodb:" ||
  !["localhost", "127.0.0.1"].includes(parsedUri.hostname) ||
  !parsedUri.searchParams.has("replicaSet")
)
  throw new Error("Explicit local replica-set _test database required");
const prefix = `workspace-${randomUUID()}`;
const members: [string, string] = [`${prefix}-a`, `${prefix}-b`];
const outsider = `${prefix}-c`;
const userIds = [...members, outsider];
const jwtSecret = `${randomUUID()}${randomUUID()}`;
process.env.JWT_SECRET = jwtSecret;
let pairId = "";
const denied = (error: Error) =>
  error instanceof DomainError && error.status === 404;
const conflict = (error: Error) =>
  error instanceof DomainError && error.status === 409;

async function main() {
  await connectToDatabase();
  for (const model of [
    User,
    Pair,
    DevelopmentRun,
    DevelopmentCompletion,
    PairWorkspace,
    EconomyWallet,
    EconomyInventory,
    EconomyLedger,
  ])
    await model.createCollection();
  await User.create(
    userIds.map((id) => ({
      id,
      username: "Test participant",
      avatar: "test-avatar",
      personal: {
        age: 25,
        gender: "male",
        city: "Test",
        relationshipStatus: "seeking",
      },
      preferences: { desiredAgeRange: { min: 18, max: 30 }, maxDistanceKm: 30 },
      profile: {
        onboarding: {
          seeking: { valuedQualities: ["honesty", "care", "curiosity"] },
        },
      },
    })),
  );
  await IdempotencyRecord.createIndexes();
  await SessionSubject.createIndexes();
  const version = await sessionRevocationService.getOrCreateVersion(members[0]);
  const token = signJwt(members[0], jwtSecret, 900, version);
  const request = (path: string, body: JsonValue, key: string) =>
    new NextRequest(`https://workspace.integration.test${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(body),
    });
  const pair = await Pair.create({
    members,
    key: members.join("|"),
    status: "active",
  });
  pairId = pair._id.toString();
  const soloStarts = await Promise.all([
    developmentService.start(members[0], "communication.reflection.1"),
    developmentService.start(members[0], "communication.reflection.1"),
  ]);
  assert.equal(soloStarts[0].run.id, soloStarts[1].run.id);
  const input = {
    runId: soloStarts[0].run.id,
    feedback: "HELPFUL" as const,
    privateNote: "private owner observation",
    answers: [
      { question: 0, value: 0 },
      { question: 1, value: 2 },
      { question: 2, value: null },
    ],
  };
  await Promise.all([
    developmentService.complete(members[0], input),
    developmentService.complete(members[0], input),
  ]);
  assert.equal(
    await DevelopmentCompletion.countDocuments({ userId: members[0] }),
    1,
  );
  assert.equal((await economyService.overview(members[0])).balance, 2);
  await assert.rejects(
    developmentService.complete(members[0], {
      ...input,
      privateNote: "changed",
    }),
    conflict,
  );
  await assert.rejects(
    developmentService.detail(outsider, input.runId),
    denied,
  );
  await mongoose.connection.db!.collection<{ _id: string }>('development_runs').updateOne({ _id: input.runId }, { $set: { contentRevision: 99 } });
  await assert.rejects(developmentService.detail(members[0], input.runId), conflict);
  await assert.rejects(developmentService.complete(members[0], input), conflict);
  await mongoose.connection.db!.collection<{ _id: string }>('development_runs').updateOne({ _id: input.runId }, { $set: { contentRevision: 1 } });
  await assert.rejects(
    developmentService.start(members[0], "reflection.deep-values-v1"),
    (error: Error) => error instanceof DomainError && error.status === 403,
  );
  const [runA, runB] = await Promise.all([
    developmentService.start(
      members[0],
      "communication.pair_practice.1",
      pairId,
    ),
    developmentService.start(
      members[1],
      "communication.pair_practice.1",
      pairId.toUpperCase(),
    ),
  ]);
  assert.equal(runA.run.id, runB.run.id);
  const pairInput = {
    runId: runA.run.id,
    feedback: "NEUTRAL" as const,
    answers: [],
    privateNote: "owner pair note",
  };
  const partial = await developmentService.complete(members[0], pairInput);
  assert.equal(partial.run.status, "PARTIAL");
  assert.equal((await economyService.overview(members[0])).balance, 2);
  const peer = await developmentService.detail(members[1], runA.run.id);
  assert.equal(peer.ownResult, null);
  assert.ok(!JSON.stringify(peer).includes("owner pair note"));
  await Promise.all([
    developmentService.complete(members[1], {
      ...pairInput,
      privateNote: "peer private note",
    }),
    developmentService.complete(members[0], pairInput),
  ]);
  assert.equal(
    (await developmentService.detail(members[0], runA.run.id)).run.status,
    "COMPLETED",
  );
  assert.equal((await economyService.overview(members[0])).balance, 7);
  assert.equal((await economyService.overview(members[1])).balance, 5);
  const overview = await developmentService.overview(members[0]);
  assert.ok(!JSON.stringify(overview).includes("private note"));
  assert.ok(
    !(
      "steps" in
      overview.content.find((item) => item.key === "reflection.deep-values-v1")!
    ),
  );
  const today = "2026-09-05";
  assert.equal(
    (await sharedLifeService.get(pairId, members[0], today)).revision,
    0,
  );
  const entryId = randomUUID();
  const command = {
    action: "SAVE" as const,
    expectedRevision: 0,
    entryId,
    data: sharedLifeEntrySchema.parse({
      kind: "TASK",
      title: "One shared task",
      assignee: "A",
      effortMinutes: 15,
    }),
  };
  const race = await Promise.allSettled([
    sharedLifeService.update(pairId, members[0], command, today),
    sharedLifeService.update(
      pairId,
      members[1],
      { ...command, entryId: randomUUID() },
      today,
    ),
  ]);
  assert.equal(race.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(
    race.filter((item) => item.status === "rejected" && conflict(item.reason))
      .length,
    1,
  );
  const current = await sharedLifeService.get(pairId, members[0], today);
  assert.equal(
    (await sharedLifeService.get(pairId.toUpperCase(), members[0], today))
      .revision,
    current.revision,
  );
  assert.equal(current.entries.length, 1);
  assert.equal(
    current.taskLoad.find((row) => row.role === "A")?.plannedMinutes,
    15,
  );
  await assert.rejects(sharedLifeService.get(pairId, outsider, today), denied);
  await assert.rejects(
    sharedLifeService.update(
      pairId,
      outsider,
      { ...command, expectedRevision: 1 },
      today,
    ),
    denied,
  );
  const exported = await productWorkspacePrivacy.exportOwnerData(members[0]);
  assert.equal(exported.sharedWorkspaces.length, 1);
  assert.ok(JSON.stringify(exported).includes("owner pair note"));
  assert.ok(!JSON.stringify(exported).includes("peer private note"));
  const workspaceKey = randomUUID();
  const workspaceBody = {
    ...command,
    expectedRevision: current.revision,
    entryId: randomUUID(),
    data: sharedLifeEntrySchema.parse({
      kind: "MEMORY",
      title: "Memory",
      date: today,
      note: "shared-note-must-not-be-cached",
    }),
  };
  const workspacePath = `/api/pairs/${pairId}/shared-life?today=${today}`;
  const workspaceContext = { params: Promise.resolve({ id: pairId }) };
  const saved = await saveWorkspaceRoute(
    request(workspacePath, workspaceBody, workspaceKey),
    workspaceContext,
  );
  assert.equal(saved.status, 200);
  const savedBody = await saved.text();
  assert.ok(!savedBody.includes("shared-note-must-not-be-cached"));
  assert.equal(
    (
      await saveWorkspaceRoute(
        request(workspacePath, workspaceBody, workspaceKey),
        workspaceContext,
      )
    ).status,
    200,
  );
  const completeKey = randomUUID();
  const completed = await completeDevelopmentRoute(
    request("/api/development/complete", pairInput, completeKey),
  );
  assert.equal(completed.status, 200);
  assert.ok(!(await completed.text()).includes("owner pair note"));
  const startKey = randomUUID();
  const startBody = { contentKey: "communication.pair_practice.1", pairId };
  assert.equal(
    (
      await startDevelopmentRoute(
        request("/api/development/start", startBody, startKey),
      )
    ).status,
    200,
  );
  const cached = await IdempotencyRecord.find({ userId: members[0] }).lean();
  assert.ok(!JSON.stringify(cached).includes("shared-note-must-not-be-cached"));
  assert.ok(!JSON.stringify(cached).includes("owner pair note"));
  await Pair.updateOne({ _id: pairId }, { $set: { status: "paused" } });
  assert.equal(
    (
      await saveWorkspaceRoute(
        request(workspacePath, workspaceBody, workspaceKey),
        workspaceContext,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await startDevelopmentRoute(
        request("/api/development/start", startBody, startKey),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await completeDevelopmentRoute(
        request("/api/development/complete", pairInput, completeKey),
      )
    ).status,
    404,
  );
  assert.equal(
    (await sharedLifeService.get(pairId, members[0], today)).readOnly,
    true,
  );
  await assert.rejects(
    sharedLifeService.update(
      pairId,
      members[0],
      { ...command, expectedRevision: 1 },
      today,
    ),
    denied,
  );
  await assert.rejects(
    developmentService.complete(members[0], pairInput),
    denied,
  );
  await Pair.updateOne({ _id: pairId }, { $set: { status: "ended" } });
  await assert.rejects(
    sharedLifeService.get(pairId, members[0], today),
    denied,
  );
  await assert.rejects(
    developmentService.detail(members[0], runA.run.id),
    denied,
  );
  assert.equal(
    (await productWorkspacePrivacy.exportOwnerData(members[0])).sharedWorkspaces
      .length,
    0,
  );
  console.log(
    "product-workspace integration PASS: real Mongo transactions, concurrent starts/completions, exactly-once rewards, pair partial/final, paywall, owner privacy, optimistic conflicts, pause/end guards.",
  );
}

main()
  .finally(async () => {
    if (mongoose.connection.readyState === 1) {
      await DevelopmentCompletion.deleteMany({ userId: { $in: userIds } });
      await DevelopmentRun.deleteMany({ participantIds: { $in: userIds } });
      if (pairId) {
        await PairWorkspace.deleteOne({ _id: pairId });
        await Pair.deleteOne({ _id: pairId });
      }
      await EconomyLedger.deleteMany({ userId: { $in: userIds } });
      await EconomyInventory.deleteMany({ userId: { $in: userIds } });
      await EconomyWallet.deleteMany({ _id: { $in: userIds } });
      await User.deleteMany({ id: { $in: userIds } });
      await IdempotencyRecord.deleteMany({ userId: { $in: userIds } });
      await SessionSubject.deleteMany({
        subjectKey: { $in: userIds.map(privacySubjectHash) },
      });
      await mongoose.disconnect();
    }
  })
  .catch((error: Error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  });
