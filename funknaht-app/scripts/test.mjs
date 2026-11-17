// Builds into .next-test (separate from the dev server) and runs the HTTP tests.
import { spawnSync } from "node:child_process";

const env = { ...process.env, NEXT_DIST_DIR: ".next-test" };
const run = args => spawnSync(process.execPath, args, { stdio: "inherit", env }).status;
if (run(["node_modules/next/dist/bin/next", "build"]) !== 0) process.exit(1);
process.exit(run(["--test", "--test-concurrency=1", "test/api.test.mjs"]) ?? 1);
