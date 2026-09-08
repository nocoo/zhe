import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
) as { version: string };

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("node:module");
});

describe("CLI_VERSION", () => {
  it("reads the package version from the runtime path", async () => {
    const { CLI_VERSION } = await import("../src/version.js");

    expect(CLI_VERSION).toBe(pkg.version);
  });

  it("falls back to the development package path", async () => {
    const requireMock = vi
      .fn<() => { version: string }>()
      .mockImplementationOnce(() => {
        throw new Error("runtime package is unavailable");
      })
      .mockReturnValue({ version: "0.0.0-development" });

    vi.doMock("node:module", () => ({ createRequire: () => requireMock }));

    const { CLI_VERSION } = await import("../src/version.js");

    expect(CLI_VERSION).toBe("0.0.0-development");
  });

  it("uses a safe default when neither package path is available", async () => {
    const requireMock = vi.fn<() => never>(() => {
      throw new Error("package is unavailable");
    });

    vi.doMock("node:module", () => ({ createRequire: () => requireMock }));

    const { CLI_VERSION } = await import("../src/version.js");

    expect(CLI_VERSION).toBe("0.0.0");
  });
});
