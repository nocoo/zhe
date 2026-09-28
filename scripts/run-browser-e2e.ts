import { spawn } from "node:child_process";
import { prepareTestRuntime } from "./lib/test-runtime";

await prepareTestRuntime(27006);
const child = spawn("bun", ["x", "playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
