import { runMain } from "@nocoo/base-cli";
import { afterEach, expect, it, vi } from "vitest";
import { createCommand } from "../src/commands/create.js";
import { updateCommand } from "../src/commands/update.js";

vi.mock("../src/config.js", () => ({ getApiKey: () => "test-only-key" }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("maps CLI title and metadata flags to independent fields and supports clearing", async () => {
  const requests: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      return Response.json({ link: { id: 1, shortUrl: "https://example.test/link" } });
    }),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  await runMain(createCommand, {
    rawArgs: ["https://example.test", "--title", "整理标题", "--note", "我的备注", "--json"],
  });
  await runMain(updateCommand, {
    rawArgs: ["1", "--title", "新标题", "--meta-title", "Raw title", "--json"],
  });
  await runMain(updateCommand, { rawArgs: ["1", "--title", "", "--note", "", "--json"] });
  expect(requests).toEqual([
    { url: "https://example.test", title: "整理标题", note: "我的备注" },
    { title: "新标题", metaTitle: "Raw title" },
    { title: null, note: null },
  ]);
});
