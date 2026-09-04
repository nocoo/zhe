import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("node:module");
});

describe("CLI_VERSION", () => {
  it("reads the package version from the runtime path", async () => {
    const { CLI_VERSION } = await import("../src/version.js");

    expect(CLI_VERSION).toBe("1.22.3");
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
