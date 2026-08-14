import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { MAX_JSON_BODY_BYTES, parseJson } from "@/lib/api/validate";
import { readIdempotencyKey } from "@/lib/idempotency/key";
import {
  createLikeBodySchema,
  listQuerySchema,
  matchingCardBodySchema,
  matchingPreferencesBodySchema,
  readCandidateGrant,
} from "@/app/api/match/schemas";

const run = async (): Promise<void> => {
  const grant = "candidate-grant-for-contract-check";

  const validCard = {
    requirements: ["Уважение", "Диалог", "Надёжность"],
    give: ["Поддержка", "Забота", "Честность"],
    questions: ["Что помогает вам доверять?", "Как выглядит хороший выходной?"],
    ageRange: { min: 24, max: 38 },
    maxDistanceKm: 75,
    active: true,
    actual: {
      relationshipIntent: "LOOKING_FOR_LONG_TERM",
      childrenIntent: "UNSURE",
    },
  };

  assert.equal(matchingCardBodySchema.safeParse(validCard).success, true);
  const parsedCard = matchingCardBodySchema.parse(validCard);
  assert.equal(
    Object.prototype.hasOwnProperty.call(parsedCard.actual, "repairSkill"),
    false,
    "untouched optional actual controls must stay absent",
  );
  assert.equal(
    matchingCardBodySchema.safeParse({ ...validCard, actorId: "attacker" })
      .success,
    false,
    "card schema must reject actor spoofing",
  );
  assert.equal(
    matchingCardBodySchema.safeParse({
      ...validCard,
      actual: { ...validCard.actual, hiddenFactor: 0.5 },
    }).success,
    false,
    "actual evidence schema must reject unknown fields",
  );

  const validLike = {
    candidateId: "candidate-2",
    candidateGrant: grant,
    agreements: [true, true, true],
    answers: ["Ответ один", "Ответ два"],
  };
  assert.equal(createLikeBodySchema.safeParse(validLike).success, true);
  for (const forbidden of ["userId", "fromId", "actorId", "status", "score"]) {
    assert.equal(
      createLikeBodySchema.safeParse({ ...validLike, [forbidden]: "spoofed" })
        .success,
      false,
      `create-like must reject client ${forbidden}`,
    );
  }
  assert.equal(
    createLikeBodySchema.safeParse({
      ...validLike,
      agreements: [true, false, true],
    }).success,
    false,
    "all three agreements must be explicit true",
  );

  const validPreference = {
    revision: 4,
    preferences: [
      {
        factorKey: "lifePlans.family.childrenIntent",
        target: { kind: "CATEGORICAL_SET", allowedValues: ["YES", "UNSURE"] },
        importance: "HIGH",
        flexibility: "IMPORTANT",
        constraintMode: "SOFT",
        useAllowed: true,
      },
    ],
  };
  assert.equal(
    matchingPreferencesBodySchema.safeParse(validPreference).success,
    true,
  );
  assert.equal(
    matchingPreferencesBodySchema.safeParse({
      ...validPreference,
      preferences: [
        {
          ...validPreference.preferences[0],
          target: { kind: "SCALAR_RANGE", minimum: 2, maximum: 1 },
        },
      ],
    }).success,
    false,
    "reversed ranges must be rejected",
  );

  assert.deepEqual(listQuerySchema.parse({}), { limit: 20 });
  assert.equal(listQuerySchema.safeParse({ limit: "50" }).success, true);
  assert.equal(listQuerySchema.safeParse({ limit: "51" }).success, false);
  assert.equal(
    listQuerySchema.safeParse({ limit: "20", userId: "other-user" }).success,
    false,
    "query actor spoofing must be rejected",
  );

  const urlOnlyGrant = readCandidateGrant(
    new Request(
      `https://example.test/api/match/card/candidate?candidateGrant=${grant}`,
    ),
  );
  assert.equal(
    urlOnlyGrant.ok,
    false,
    "candidate grant must never be accepted from URL",
  );
  const headerGrant = readCandidateGrant(
    new Request("https://example.test/api/match/card/candidate", {
      headers: { "X-Candidate-Grant": grant },
    }),
  );
  assert.equal(headerGrant.ok, true, "candidate grant header must be accepted");

  const validJsonRequest = new Request("https://example.test/api/match/card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validCard),
  });
  const parsedJson = await parseJson(validJsonRequest, matchingCardBodySchema);
  assert.equal(parsedJson.ok, true);

  const wrongContentType = await parseJson(
    new Request("https://example.test/api/match/card", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(validCard),
    }),
    matchingCardBodySchema,
  );
  assert.equal(wrongContentType.ok, false);
  if (!wrongContentType.ok) assert.equal(wrongContentType.response.status, 415);

  const oversized = await parseJson(
    new Request("https://example.test/api/match/card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(MAX_JSON_BODY_BYTES + 1) }),
    }),
    matchingCardBodySchema,
  );
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.response.status, 413);

  assert.equal(
    readIdempotencyKey(new Request("https://example.test", { method: "POST" }))
      .ok,
    false,
    "matching mutations rely on required idempotency keys",
  );
  assert.equal(
    readIdempotencyKey(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Idempotency-Key": "123e4567-e89b-42d3-a456-426614174000" },
      }),
    ).ok,
    true,
  );

  const routeModules = await Promise.all([
    import("@/app/api/match/card/route"),
    import("@/app/api/match/card/[id]/route"),
    import("@/app/api/match/preferences/route"),
    import("@/app/api/match/feed/route"),
    import("@/app/api/match/inbox/route"),
    import("@/app/api/match/like/[id]/route"),
    import("@/app/api/match/like/route"),
    import("@/app/api/match/respond/route"),
    import("@/app/api/match/accept/route"),
    import("@/app/api/match/reject/route"),
    import("@/app/api/match/block/route"),
    import("@/app/api/match/block/[id]/route"),
    import("@/app/api/match/connections/[id]/route"),
    import("@/app/api/match/confirm/route"),
  ]);
  assert.equal(routeModules.length, 14);

  const feedRoute = routeModules[3];
  assert.equal(typeof feedRoute.GET, "function");
  const unauthorized = await feedRoute.GET(
    new NextRequest("https://example.test/api/match/feed"),
  );
  assert.equal(
    unauthorized.status,
    401,
    "matching routes must require session actor",
  );
  assert.equal(unauthorized.headers.get("cache-control"), "private, no-store");

  console.log("Matching API contract self-check passed.");
};

void run();
