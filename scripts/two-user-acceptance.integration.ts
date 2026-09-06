import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

const suites = [
  "entry-onboarding",
  "matching-social-flow",
  "matching-pair-transition",
  "two-user-mvp",
  "pair-lifecycle-remaining",
  "product-workspace",
] as const;

async function main(): Promise<void> {
  // Never fall back to the application environment or read a .env file.
  const target = requireMatchingTestDatabaseTarget();
  const local = new URL(target.uri);
  if (
    local.protocol !== "mongodb:" ||
    !["127.0.0.1", "localhost"].includes(local.hostname) ||
    !local.searchParams.get("replicaSet")
  ) throw new Error("TWO_USER_ACCEPTANCE_REQUIRES_LOCAL_REPLICA_SET");

  const workspace = fileURLToPath(new URL("../", import.meta.url));
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const startedAt = Date.now();
  const results: Array<{ suite: string; database: string; status: "passed"; durationMs: number }> = [];
  for (const [index, suite] of suites.entries()) {
    // Each invocation and each suite gets a fresh namespace. Individual suites
    // remove only their run-scoped synthetic records, never dropDatabase().
    const database = `${target.databaseName.slice(0, 20)}_${index + 1}_${runId}_test`;
    const suiteTarget = new URL(local);
    suiteTarget.pathname = `/${database}`;
    process.stdout.write(`${JSON.stringify({ suite, database, status: "running" })}\n`);
    const suiteStarted = Date.now();
    const exitCode = await new Promise<number>((resolveExit, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", resolve(workspace, "scripts", `${suite}.integration.ts`)], {
        cwd: workspace,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          MONGODB_URI: suiteTarget.toString(),
          MATCHING_TEST_MONGODB_URI: suiteTarget.toString(),
          JWT_SECRET: `${randomUUID()}${randomUUID()}`,
        },
      });
      // Forward only fixed stage labels from the multi-cycle acceptance test;
      // generated ids, payloads and the full child diagnostics remain private.
      child.stdout.resume();
      let buffered = "";
      child.stderr.on("data", (chunk: Buffer) => {
        buffered += chunk.toString("utf8");
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          const progress = /^\{"suite":"two-user-mvp","stage":"([A-Za-z0-9 ]{1,80})","status":"(running|passed|failed)"\}$/.exec(line.trim());
          if (suite === "two-user-mvp" && progress) {
            process.stdout.write(`${JSON.stringify({ suite, stage: progress[1], status: progress[2] })}\n`);
          }
        }
        if (buffered.length > 4_096) buffered = "";
      });
      child.once("error", () => reject(new Error(`TWO_USER_ACCEPTANCE_START_FAILED:${suite}`)));
      child.once("close", (code) => resolveExit(code ?? 1));
    });
    if (exitCode !== 0) {
      process.stdout.write(`${JSON.stringify({ suite, database, status: "failed", exitCode })}\n`);
      throw new Error(`TWO_USER_ACCEPTANCE_STAGE_FAILED:${suite}`);
    }
    const result = { suite, database, status: "passed" as const, durationMs: Date.now() - suiteStarted };
    results.push(result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
  process.stdout.write(`${JSON.stringify({
    suite: "two-user-acceptance", status: "passed", durationMs: Date.now() - startedAt,
    results, discordIframeValidated: false, realOAuthValidated: false,
  })}\n`);
}

void main().catch((error: Error) => {
  // Guard errors and stage identifiers contain neither the URI nor credentials.
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
