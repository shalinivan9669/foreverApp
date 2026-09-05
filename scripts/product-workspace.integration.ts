import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { GET as getWorkspaceRoute, POST as saveWorkspaceRoute } from "@/app/api/pairs/[id]/shared-life/route";
import { GET as getDevelopmentRoute } from "@/app/api/development/runs/[id]/route";
import { POST as startDevelopmentRoute } from "@/app/api/development/start/route";
import { POST as completeDevelopmentRoute } from "@/app/api/development/complete/route";
import { signJwt } from "@/lib/jwt";
import { sessionRevocationService } from "@/domain/services/sessionRevocation.service";
import { privacySubjectHash } from "@/lib/privacy/subjectHash";
import { IdempotencyRecord } from "@/models/IdempotencyRecord";
import { SessionSubject } from "@/models/SessionSubject";
import type { JsonValue } from "@/lib/api/response";
import type { SharedLifeDTO } from "@/lib/dto/sharedLife.dto";
import type { DevelopmentDetailDTO } from "@/lib/dto/development.dto";
import { parseMatchingTestDatabaseUri } from "./lib/matching-test-database";
import { connectToDatabase } from "@/lib/mongodb";
import { createDevelopmentService, developmentService } from "@/domain/services/development.service";
import { DEVELOPMENT_CONTENT_REPOSITORY } from "@/domain/model/development/catalog";
import { createDevelopmentContentRepository } from "@/domain/model/development/publications";
import { sharedLifeService } from "@/domain/services/sharedLife.service";
import { economyIdentity, economyService } from "@/domain/services/economy.service";
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
import { EvidenceEvent } from "@/models/EvidenceEvent";
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
const unavailableVersion = (error: Error) =>
  error instanceof DomainError && error.code === "CONTENT_VERSION_UNAVAILABLE" && error.status === 409;

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
  const peerVersion = await sessionRevocationService.getOrCreateVersion(members[1]);
  const peerToken = signJwt(members[1], jwtSecret, 900, peerVersion);
  const readRequest = (path: string, peer = false) => new NextRequest(`https://workspace.integration.test${path}`, {
    headers: { authorization: `Bearer ${peer ? peerToken : token}` },
  });
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
  const originalPublication = DEVELOPMENT_CONTENT_REPOSITORY.findRevision("communication.reflection.1", 1);
  assert.ok(originalPublication);
  const updatedPublication = {
    content: { ...originalPublication.content, revision: 2, prompts: [...originalPublication.content.prompts, "Новый вопрос только второй редакции"] },
    responseOptions: ["Новая формулировка 1", "Новая формулировка 2", "Новая формулировка 3", "Новая формулировка 4"],
  };
  // A new immutable repository models publication/deploy; no production catalog
  // mutation or database version rewriting is involved in the upgrade scenario.
  const updatedService = createDevelopmentService(createDevelopmentContentRepository([
    ...DEVELOPMENT_CONTENT_REPOSITORY.listLatest(), updatedPublication,
  ]));
  const oldRunAfterPublication = await updatedService.detail(members[0], soloStarts[0].run.id);
  assert.equal(oldRunAfterPublication.content.revision, 1);
  assert.deepEqual(oldRunAfterPublication.content.prompts, originalPublication.content.prompts);
  assert.deepEqual(oldRunAfterPublication.responseOptions, originalPublication.responseOptions);
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
    updatedService.complete(members[0], input),
    updatedService.complete(members[0], input),
  ]);
  assert.equal(
    await DevelopmentCompletion.countDocuments({ userId: members[0] }),
    1,
  );
  assert.equal((await economyService.overview(members[0])).balance, 2);
  const oldCompletion = await DevelopmentCompletion.findOne({ runId: input.runId, userId: members[0] }).lean();
  assert.equal(oldCompletion?.contentRevision, 1);
  const newRunAfterPublication = await updatedService.start(members[0], "communication.reflection.1");
  assert.notEqual(newRunAfterPublication.run.id, input.runId);
  assert.equal(newRunAfterPublication.content.revision, 2);
  assert.deepEqual(newRunAfterPublication.content.prompts, updatedPublication.content.prompts);
  assert.deepEqual(newRunAfterPublication.responseOptions, updatedPublication.responseOptions);
  await assert.rejects(updatedService.complete(members[0], { ...input, runId: newRunAfterPublication.run.id }), (error: Error) => error instanceof DomainError && error.code === "VALIDATION_ERROR");
  await updatedService.complete(members[0], input);
  assert.deepEqual(await DevelopmentCompletion.findOne({ runId: input.runId, userId: members[0] }).lean(), oldCompletion, "publication and retry preserve the completed v1 result");
  assert.equal((await economyService.overview(members[0])).balance, 2, "publication cannot reward the old run again");
  assert.equal(await EvidenceEvent.countDocuments({ actorId: { $in: userIds } }), 0, "demo reflection must not become Factor evidence");
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
  await assert.rejects(developmentService.detail(members[0], input.runId), unavailableVersion);
  await assert.rejects(developmentService.complete(members[0], input), unavailableVersion);
  await assert.rejects(developmentService.detail(outsider, input.runId), denied, "ownership must be checked before the missing archive response");
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
  const runPath = `/api/development/runs/${runA.run.id}`;
  const runContext = { params: Promise.resolve({ id: runA.run.id }) };
  const partialPeerResponse = await getDevelopmentRoute(readRequest(runPath, true), runContext);
  assert.equal(partialPeerResponse.status, 200);
  const partialPeerBody = await partialPeerResponse.text();
  assert.ok(!partialPeerBody.includes("owner pair note"), "partial API must hide peer private notes");
  const partialPeer = JSON.parse(partialPeerBody) as { ok: true; data: DevelopmentDetailDTO };
  assert.equal(partialPeer.data.run.status, "PARTIAL");
  assert.equal(partialPeer.data.ownResult, null);
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
  const finalOwnerResponse = await getDevelopmentRoute(readRequest(runPath), runContext);
  assert.equal(finalOwnerResponse.status, 200);
  const finalOwnerBody = await finalOwnerResponse.text();
  assert.ok(!finalOwnerBody.includes("peer private note"), "final API must hide peer private notes");
  const finalOwner = JSON.parse(finalOwnerBody) as { ok: true; data: DevelopmentDetailDTO };
  assert.equal(finalOwner.data.run.status, "COMPLETED", "first participant sees final after a fresh GET");
  assert.ok(finalOwner.data.content.outcome.length > 0);
  await developmentService.complete(members[1], { ...pairInput, privateNote: "peer private note" });
  assert.equal(await EconomyLedger.countDocuments({ userId: { $in: members }, sourceKind: "PAIR_ACTIVITY" }), 2, "completion retries reward each participant once");
  const overview = await developmentService.overview(members[0]);
  assert.ok(overview.content.some((item) => item.key === overview.suggestion.contentKey && !item.locked), "completion leaves a reachable next suggestion");
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
  let current = await sharedLifeService.get(pairId, members[0], today);
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
  const sharedEntry = current.entries[0];
  assert.ok(sharedEntry);
  const peerEdit = {
    ...command, expectedRevision: current.revision, entryId: sharedEntry.id,
    data: sharedLifeEntrySchema.parse({ ...sharedEntry.data, title: "Updated by second participant", effortMinutes: 25 }),
  };
  await sharedLifeService.update(pairId, members[1], peerEdit, today);
  const reloadedWorkspace = await getWorkspaceRoute(
    readRequest(`/api/pairs/${pairId}/shared-life?today=${today}`),
    { params: Promise.resolve({ id: pairId }) },
  );
  assert.equal(reloadedWorkspace.status, 200);
  const refreshed = (await reloadedWorkspace.json()) as { ok: true; data: SharedLifeDTO };
  assert.equal(refreshed.data.entries[0].data.title, peerEdit.data.title, "first participant sees peer edit after refresh");
  assert.equal(refreshed.data.entries[0].updatedBy, "B");
  const staleEdit = { ...peerEdit, data: sharedLifeEntrySchema.parse({ ...sharedEntry.data, title: "Owner reviewed merged edit" }) };
  await assert.rejects(sharedLifeService.update(pairId, members[0], staleEdit, today), conflict);
  assert.equal((await sharedLifeService.get(pairId, members[0], today)).entries[0].data.title, peerEdit.data.title, "stale submission must preserve peer edit");
  current = await sharedLifeService.update(pairId, members[0], {
    ...staleEdit, expectedRevision: refreshed.data.revision,
    data: sharedLifeEntrySchema.parse({ ...refreshed.data.entries[0].data, title: staleEdit.data.title }),
  }, today);
  assert.equal(current.entries[0].data.title, staleEdit.data.title);
  assert.equal(current.taskLoad.find((row) => row.role === "A")?.plannedMinutes, 25, "reviewed retry preserves the peer's other edit");
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
  const archiveUnavailableService = createDevelopmentService(createDevelopmentContentRepository([]));
  await assert.rejects(archiveUnavailableService.complete(members[0], pairInput), denied, "pause access wins over an unavailable archive");
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
  await assert.rejects(archiveUnavailableService.detail(members[0], runA.run.id), denied, "ended access wins over an unavailable archive");
  assert.equal((await getDevelopmentRoute(readRequest(runPath), runContext)).status, 404);
  assert.equal((await getWorkspaceRoute(readRequest(workspacePath), workspaceContext)).status, 404);
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
  const oldUnfinished = await developmentService.start(members[0], "communication.solo_practice.1");
  await mongoose.connection.db!.collection<{ _id: string }>("development_runs").updateOne({ _id: oldUnfinished.run.id }, { $set: { createdAt: new Date("2000-01-01T00:00:00.000Z") } });
  await DevelopmentRun.create(Array.from({ length: 31 }, (_, index) => ({
    _id: randomBytes(32).toString("hex"), contentKey: "communication.solo_practice.1",
    contentRevision: 1, periodKey: `fixture-period-${index}`, participantIds: [members[0]],
    completedUserIds: [members[0]], status: "COMPLETED", revision: 1,
    createdAt: new Date(), completedAt: new Date(),
  })));
  assert.ok((await developmentService.overview(members[0])).recent.some((run) => run.id === oldUnfinished.run.id && run.status === "ACTIVE"), "31 recent completed runs must not hide an older unfinished run");

  const locked = (error: Error) => error instanceof DomainError && error.code === "ECONOMY_CONTENT_LOCKED" && error.status === 403;
  const paidKey = "reflection.deep-values-v1";
  const paidV1 = DEVELOPMENT_CONTENT_REPOSITORY.findRevision(paidKey, 1);
  assert.ok(paidV1);
  const inventoryId = economyIdentity(outsider, "inventory", "content.deep-values");
  await EconomyInventory.create({ _id: inventoryId, userId: outsider, itemId: "content.deep-values", quantity: 1, acquiredAt: new Date() });
  const paidRun = await developmentService.start(outsider, paidKey);
  const paidUpdatedService = createDevelopmentService(createDevelopmentContentRepository([
    ...DEVELOPMENT_CONTENT_REPOSITORY.listLatest(), { ...paidV1, content: { ...paidV1.content, revision: 2 } },
  ]));
  assert.equal((await paidUpdatedService.detail(outsider, paidRun.run.id)).content.revision, 1);
  await EconomyInventory.deleteOne({ _id: inventoryId });
  const paidInput = { runId: paidRun.run.id, feedback: "NEUTRAL" as const, privateNote: "", answers: paidV1.content.prompts.map((_, question) => ({ question, value: null })) };
  await assert.rejects(paidUpdatedService.detail(outsider, paidRun.run.id), locked);
  await assert.rejects(paidUpdatedService.complete(outsider, paidInput), locked);
  await assert.rejects(paidUpdatedService.assertRunAccess(outsider, paidRun.run.id), locked);
  await assert.rejects(archiveUnavailableService.detail(outsider, paidRun.run.id), locked, "revoked paid access wins over unavailable archive");
  assert.ok(!(await developmentService.overview(outsider)).recent.some((run) => run.id === paidRun.run.id), "locked run must disappear from resumable owner overview");
  console.log(
    "product-workspace integration PASS: immutable v1/v2, resumable old runs, access before archive/replay, exactly-once rewards, pair partial/final API privacy, peer refresh and reviewed conflict retry.",
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
      await EvidenceEvent.deleteMany({ actorId: { $in: userIds } });
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
