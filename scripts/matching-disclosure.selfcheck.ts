import assert from "node:assert/strict";
import {
  matchApi,
  normalizeCandidateMatchingCard,
  normalizeMatchingFeed,
  normalizeMatchingInbox,
  normalizeMatchingLike,
} from "@/client/api/match.api";

const run = async (): Promise<void> => {
  const user = { id: "u2", username: "Алекс", avatar: "" };
  const card = {
    requirements: ["Уважение", "Диалог", "Надёжность"],
    give: ["Поддержка", "Тепло", "Честность"],
    questions: ["Что помогает доверять?", "Как вы отдыхаете?"],
    factorValues: { secret: 0.8 },
    rawAnswers: ["private"],
  };
  const fit = {
    label: "PROMISING",
    confidence: "HIGH",
    explanations: ["Похожий взгляд на ритм жизни"],
    score: 0.91,
    evidenceIds: ["evidence-secret"],
    inputHash: "private-hash",
  };
  const grant = "opaque-presentation-grant";

  const feed = normalizeMatchingFeed({
    items: [
      {
        candidate: {
          ...user,
          rawPreferences: { children: "YES" },
          exactRanges: { age: [24, 30] },
        },
        card,
        fit,
        candidateGrant: grant,
        algorithmVersion: 99,
      },
    ],
    feedRevision: "feed-revision-1",
    rawCandidatePool: ["u2"],
  });
  assert.equal(
    feed.items[0]?.candidateGrant,
    grant,
    "feed may retain opaque grant",
  );

  const candidate = normalizeCandidateMatchingCard({
    candidate: user,
    card,
    fit,
    candidateGrant: grant,
    rawPreferences: { hidden: true },
  });
  const like = normalizeMatchingLike({
    id: "like-1",
    status: "RESPONDED",
    role: "INITIATOR",
    peer: user,
    allowedActions: ["ACCEPT", "DECLINE", "BLOCK"],
    card,
    questions: card.questions,
    responseAnswers: ["Открытый диалог", "Прогулка"],
    score: 71,
    matchScore: 71,
    candidateGrant: grant,
    rawPreferences: { hidden: true },
    factorValues: { secret: 0.8 },
    evidenceIds: ["private"],
  });
  const inbox = normalizeMatchingInbox({
    incoming: [
      {
        id: "like-2",
        status: "SENT",
        role: "RECIPIENT",
        peer: user,
        allowedActions: ["RESPOND", "DECLINE", "BLOCK"],
        matchScore: 71,
        candidateGrant: grant,
      },
    ],
    outgoing: [],
    connections: [],
    score: 71,
  });

  const publicPayloads = JSON.stringify({ candidate, like, inbox });
  for (const forbidden of [
    "score",
    "matchScore",
    "rawPreferences",
    "exactRanges",
    "rawAnswers",
    "factorValues",
    "evidenceIds",
    "inputHash",
    "algorithmVersion",
    "candidateGrant",
  ]) {
    assert.doesNotMatch(
      publicPayloads,
      new RegExp(forbidden, "i"),
      `${forbidden} must not escape public card/like/inbox normalizers`,
    );
  }

  const feedPayload = JSON.stringify(feed);
  assert.doesNotMatch(
    feedPayload,
    /score|rawPreferences|factorValues|evidenceIds|inputHash/i,
  );
  assert.match(feedPayload, /candidateGrant/);

  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; headers: Headers; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    requests.push({
      url,
      headers: new Headers(init?.headers),
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    const data = url.includes("/api/match/card/")
      ? { candidate: user, card, fit }
      : {
          id: "like-transport",
          status: "SENT",
          role: "INITIATOR",
          peer: user,
          allowedActions: ["DECLINE", "BLOCK"],
        };
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await matchApi.getCandidateCard("u2", grant);
    await matchApi.createLike({
      candidateId: "u2",
      candidateGrant: grant,
      agreements: [true, true, true],
      answers: ["Открытый диалог", "Прогулка"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const candidateRequest = requests[0];
  assert.ok(candidateRequest);
  assert.doesNotMatch(
    candidateRequest.url,
    /candidateGrant|opaque-presentation-grant/,
  );
  assert.equal(candidateRequest.headers.get("X-Candidate-Grant"), grant);
  const likeRequest = requests[1];
  assert.ok(likeRequest);
  assert.doesNotMatch(
    likeRequest.url,
    /candidateGrant|opaque-presentation-grant/,
  );
  assert.equal(likeRequest.headers.has("Idempotency-Key"), true);
  const likeBody = JSON.parse(likeRequest.body ?? "{}") as Record<
    string,
    unknown
  >;
  assert.equal(likeBody.candidateGrant, grant);
  assert.equal(
    Object.prototype.hasOwnProperty.call(likeBody, "actorId"),
    false,
  );
  assert.equal(Object.prototype.hasOwnProperty.call(likeBody, "fromId"), false);

  console.log("Matching disclosure self-check passed.");
};

void run();
