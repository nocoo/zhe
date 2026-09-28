import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { relative, resolve } from "node:path";
import { prepareTestEnvironment } from "./test-environment";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Port allocation failed");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}
export async function prepareTestRuntime(defaultPort: number): Promise<void> {
  prepareTestEnvironment();
  const id = randomUUID();
  process.env.ZHE_RUN_ID = id;
  process.env.ZHE_TEST_WORKER_PORT = String(await freePort());
  process.env.ZHE_TEST_APP_PORT = String(process.env.ZHE_TEST_APP_PORT || defaultPort);
  const output = resolve(".next-test", id);
  await mkdir(output, { recursive: true });
  const dirs = [
    "app",
    "actions",
    "components",
    "contexts",
    "hooks",
    "lib",
    "models",
    "scripts",
    "tests",
    "viewmodels",
  ];
  const configDir = resolve(".artifacts", "e2e", id);
  await mkdir(configDir, { recursive: true });
  const config = resolve(configDir, "tsconfig.json");
  await writeFile(
    config,
    JSON.stringify({
      extends: "../../../tsconfig.json",
      include: [
        resolve("*.ts"),
        ...dirs.flatMap((dir) => [resolve(dir, "**/*.ts"), resolve(dir, "**/*.tsx")]),
        resolve(output, "types/**/*.ts"),
      ],
      exclude: [resolve("node_modules"), resolve("worker"), resolve("cli")],
    }),
  );
  process.env.ZHE_TEST_TSCONFIG = relative(process.cwd(), config);
}
