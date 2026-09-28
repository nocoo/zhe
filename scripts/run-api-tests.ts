import { prepareTestRuntime } from "./lib/test-runtime";

await prepareTestRuntime(17006);
await import("./run-api-e2e");
