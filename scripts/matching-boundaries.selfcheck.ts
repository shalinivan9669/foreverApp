import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const application = source(
  "src/domain/services/matching/matchingApplication.service.ts",
);
const grantPort = source(
  "src/domain/services/matching/social/mongoCandidateGrant.port.ts",
);
const profileRuntime = source(
  "src/domain/services/matching/matchingProfileRuntime.service.ts",
);
const profileModel = source("src/models/MatchingProfile.ts");
const pairFormation = source("src/domain/services/pairFormation.service.ts");
const matchingIntelligence = source(
  "src/domain/services/matching/intelligence/matchingIntelligence.service.ts",
);
const accountDeletion = source(
  "src/domain/services/accountDeletion.service.ts",
);

const section = (contents: string, start: string, end: string): string => {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source section end: ${end}`);
  return contents.slice(startIndex, endIndex);
};

assert.match(application, /distanceKm\(/);
assert.match(
  application,
  /Math\.min\(requester\.maxDistanceKm, candidate\.maxDistanceKm\)/,
);
assert.match(
  application,
  /requesterProjection\.age < candidate\.desiredAgeRange\.min/,
);
assert.match(application, /MatchingBlock\.find\(/);
assert.match(application, /MatchingConnection\.find\(/);
assert.match(application, /PairMembershipClaim\.find\(/);
assert.match(application, /rankCandidates\(/);
assert.doesNotMatch(
  application,
  /for \([^)]*\)[\s\S]{0,300}matchingIntelligence\.evaluate\(/,
);
const grantIssuance = application.slice(
  application.indexOf("const grantCandidates = async"),
  application.indexOf("const candidateGrantLookup = async"),
);
assert.match(grantIssuance, /session\.withTransaction/);
assert.match(grantIssuance, /pairMembershipRevision:\s*1/);
assert.match(grantIssuance, /MatchingBlock\.find\([\s\S]*\.session\(session\)/);
assert.match(
  grantIssuance,
  /CandidatePresentationGrant\.insertMany\([\s\S]*session/,
);
const candidateCard = application.slice(
  application.indexOf("export async function getCandidateMatchingCard"),
  application.indexOf("export async function createMatchingLike"),
);
assert.match(candidateCard, /session\.withTransaction/);
assert.match(candidateCard, /pairMembershipRevision:\s*1/);
assert.match(candidateCard, /candidateGrantLookup\([\s\S]*session/);
assert.match(grantPort, /activeInteraction/);
assert.match(grantPort, /declineCooldown/);
assert.match(grantPort, /activeConnection/);
assert.match(grantPort, /PairMembershipClaim\.exists/);
assert.match(grantPort, /distanceKm\(/);
assert.match(profileRuntime, /MATCHING_LOCATION_REQUIRED/);
assert.match(profileRuntime, /reasonCode:\s*["']NOT_ANSWERED["']/);
assert.match(profileRuntime, /\$unset: \{ actual: 1 \}/);
assert.match(
  profileModel,
  /Active matching requires requested discovery and ready required data/,
);
assert.doesNotMatch(profileModel, /\n\s*actual:\s*\{/);

const sourceLoader = section(
  profileRuntime,
  "export const loadMatchingActualProfileSources",
  "const readinessFor",
);
assert.match(
  sourceLoader,
  /if \(input\.session\) \{[\s\S]*profiles\s*=\s*await profileQuery[\s\S]*snapshots = await latestSnapshots\(input\);[\s\S]*grants = await latestGrants\(input\);[\s\S]*\} else \{/,
);
assert.doesNotMatch(
  section(
    profileRuntime,
    "export const saveMatchingProfile",
    "export type UpdatePreferenceInput",
  ),
  /Promise\.all/,
);
assert.doesNotMatch(
  section(
    profileRuntime,
    "export const updateMatchingPreferenceProfile",
    "export const getMatchingReadiness",
  ),
  /Promise\.all/,
);
assert.doesNotMatch(
  section(matchingIntelligence, "const loadInputs", "const actualByOwner"),
  /Promise\.all/,
);
assert.doesNotMatch(
  section(pairFormation, "const closeConflictingMatchingState", "/**"),
  /Promise\.all/,
);
assert.doesNotMatch(
  section(accountDeletion, "await session.withTransaction", "} finally {"),
  /Promise\.all/,
);

process.stdout.write(
  `${JSON.stringify({ ok: true, mutualAge: true, mutualDistance: true, noRawActual: true, serializedClientSessionOperations: true })}\n`,
);
