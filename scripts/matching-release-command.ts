import { spawnSync } from "node:child_process";
import { requireMatchingTestDatabaseTarget } from "./lib/matching-test-database";

const writeFailure = (stage: string, errorCode: string): void => {
  process.stderr.write(`${JSON.stringify({ ok: false, stage, errorCode })}\n`);
};

const main = (): void => {
  const command = process.argv[2];
  if (command !== "preflight" && command !== "load-smoke") {
    writeFailure("invalid", "MATCHING_RELEASE_COMMAND_INVALID");
    process.exitCode = 1;
    return;
  }

  let target: ReturnType<typeof requireMatchingTestDatabaseTarget>;
  try {
    target = requireMatchingTestDatabaseTarget();
  } catch (error) {
    const errorCode =
      error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)
        ? error.message
        : "MATCHING_TEST_DATABASE_GUARD_FAILED";
    writeFailure(command, errorCode);
    process.exitCode = 1;
    return;
  }
  const script =
    command === "preflight"
      ? "./scripts/release-preflight.ts"
      : "./scripts/matching-load-smoke.ts";
  const child = spawnSync(
    process.execPath,
    ["./node_modules/tsx/dist/cli.mjs", script, ...process.argv.slice(3)],
    {
      stdio: "inherit",
      env: { ...process.env, MONGODB_URI: target.uri },
    },
  );
  if (child.error) {
    writeFailure(command, "MATCHING_RELEASE_CHILD_START_FAILED");
    process.exitCode = 1;
    return;
  }
  process.exitCode = child.status ?? 1;
};

main();
