import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

type HelloEvidence = {
  msg?: string;
  setName?: string;
  hosts?: string[];
  passives?: string[];
  arbiters?: string[];
  me?: string;
  primary?: string;
  serviceId?: object;
};

const atlasHostname = (value: string): boolean => {
  const withoutPort = value.trim().toLowerCase().replace(/:\d+$/, "");
  return withoutPort.endsWith(".mongodb.net");
};

const configuredMongoHosts = (uri: string): string[] => {
  const match = /^(mongodb(?:\+srv)?):\/\/([^/?#]+)/i.exec(uri.trim());
  if (!match) return [];
  const authority = match[2] ?? "";
  const hostList = authority.slice(authority.lastIndexOf("@") + 1);
  return hostList
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
};

const reportedMongoHosts = (hello: HelloEvidence): string[] =>
  [
    ...(hello.hosts ?? []),
    ...(hello.passives ?? []),
    ...(hello.arbiters ?? []),
    ...(hello.me ? [hello.me] : []),
    ...(hello.primary ? [hello.primary] : []),
  ].filter((host, index, all) => all.indexOf(host) === index);

const hasAtlasTopologyEvidence = (
  uri: string,
  hello: HelloEvidence,
): boolean => {
  const configured = configuredMongoHosts(uri);
  if (configured.length === 0 || !configured.every(atlasHostname)) return false;
  const reported = reportedMongoHosts(hello);
  if (hello.msg === "isdbgrid") return true;
  if (hello.serviceId) return true;
  return (
    typeof hello.setName === "string" &&
    hello.setName.trim().length > 0 &&
    reported.length > 0 &&
    reported.every(atlasHostname)
  );
};

const probeAtlasTarget = async (uri: string): Promise<boolean> => {
  const configured = configuredMongoHosts(uri);
  if (configured.length === 0 || !configured.every(atlasHostname)) return false;
  const client = new mongoose.mongo.MongoClient(uri, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 5_000,
  });
  try {
    await client.connect();
    const hello = (await client
      .db()
      .admin()
      .command({ hello: 1 })) as HelloEvidence;
    return hasAtlasTopologyEvidence(uri, hello);
  } finally {
    await client.close();
  }
};

const writeFailure = (reason: string): void => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, reason, atlasValidated: false })}\n`,
  );
};

export const matchingReleaseTestSupport = {
  configuredMongoHosts,
  hasAtlasTopologyEvidence,
};

const main = async (): Promise<void> => {
  let target: ReturnType<typeof requireMatchingTestDatabaseTarget>;
  try {
    target = requireMatchingTestDatabaseTarget();
  } catch (error) {
    const reason =
      error instanceof Error &&
      [
        "MATCHING_TEST_MONGODB_URI_REQUIRED",
        "MATCHING_TEST_MONGODB_URI_INVALID",
        "MATCHING_TEST_DATABASE_GUARD_FAILED",
      ].includes(error.message)
        ? error.message
        : "MATCHING_TEST_DATABASE_GUARD_FAILED";
    writeFailure(reason);
    process.exitCode = 1;
    return;
  }

  let atlasEvidence = false;
  try {
    atlasEvidence = await probeAtlasTarget(target.uri);
  } catch {
    writeFailure("MATCHING_ATLAS_EVIDENCE_UNAVAILABLE");
    process.exitCode = 1;
    return;
  }
  if (!atlasEvidence) {
    writeFailure("MATCHING_ATLAS_TARGET_REQUIRED");
    process.exitCode = 1;
    return;
  }

  const commands: Array<[string, string[]]> = [
    ["npm", ["run", "release:matching-preflight"]],
    ["npm", ["run", "release:matching-migrate", "--", "--mode=VERIFY"]],
    ["npm", ["run", "integration:matching-atlas"]],
    ["npm", ["run", "release:matching-load-smoke"]],
  ];
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, {
      stdio: "pipe",
      encoding: "utf8",
      maxBuffer: 10 * 1_024 * 1_024,
      shell: process.platform === "win32",
      env: process.env,
    });
    if (result.status !== 0) {
      writeFailure("MATCHING_RELEASE_STAGE_FAILED");
      process.exitCode = result.status ?? 1;
      return;
    }
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, atlasValidated: true })}\n`,
  );
};

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === resolve(fileURLToPath(import.meta.url))) {
  void main().catch(() => {
    writeFailure("MATCHING_RELEASE_VERIFICATION_FAILED");
    process.exitCode = 1;
  });
}
