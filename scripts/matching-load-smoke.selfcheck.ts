import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = readFileSync(
  path.join(root, "scripts", "matching-load-smoke.ts"),
  "utf8",
);
const wrapper = readFileSync(
  path.join(root, "scripts", "matching-release-command.ts"),
  "utf8",
);

for (const required of [
  "CANDIDATE_PROJECTION_COUNT = 10_000",
  "PAGE_SIZE = 20",
  "MATCHING_PRE_RANKING_POOL_LIMIT",
  "feedRanking: 1_000",
  "FEED_P99_BUDGET_MS = 2_000",
  "inbox: 500",
  "candidateCard: 500",
  "socialMutation: 750",
  'endsWith(".mongodb.net")',
  "hasAtlasTopologyEvidence",
  'explain("executionStats")',
  "candidate_discovery_location",
  "COLLSCAN",
  "getMatchingFeed",
  "getCandidateMatchingCard",
  "getMatchingInbox",
  "createMatchingLike",
  "factorSnapshotReadCommands",
  "stablePagination: true",
  "unexpected5xx: 0",
  "duplicateViolations: 0",
  "crossUserDisclosure: 0",
  "CandidateDiscoveryProjection.deleteMany({",
  "userId: { $in: fullOwnerIds }",
]) {
  assert.ok(
    source.includes(required),
    `matching load smoke is missing ${required}`,
  );
}
assert.ok(wrapper.includes('"./scripts/matching-load-smoke.ts"'));
assert.equal(wrapper.includes('"./scripts/release-load-smoke.ts"'), false);

const environment = { ...process.env };
delete environment.MATCHING_TEST_MONGODB_URI;
delete environment.MONGODB_URI;
const failClosed = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "scripts", "matching-release-command.ts"),
    "load-smoke",
  ],
  { cwd: root, env: environment, encoding: "utf8" },
);
assert.notEqual(failClosed.status, 0);
assert.match(
  `${failClosed.stdout}${failClosed.stderr}`,
  /MATCHING_TEST_MONGODB_URI_REQUIRED/,
);

const nonAtlas = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(root, "scripts", "matching-release-command.ts"),
    "load-smoke",
  ],
  {
    cwd: root,
    env: {
      ...environment,
      MATCHING_TEST_MONGODB_URI:
        "mongodb://127.0.0.1:27018/foreverapp_matching_test?replicaSet=rs0",
    },
    encoding: "utf8",
  },
);
assert.notEqual(nonAtlas.status, 0);
assert.match(
  `${nonAtlas.stdout}${nonAtlas.stderr}`,
  /MATCHING_LOAD_SMOKE_ATLAS_REQUIRED/,
);

console.log("matching-load-smoke.selfcheck: ok");
