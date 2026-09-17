// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const load = vi.fn();
const run = vi.fn();
vi.mock("@/lib/auth-context", () => ({ getAuthContext: (...args: unknown[]) => auth(...args) }));
vi.mock("@/lib/ai/link-context", () => ({
  loadLinkOrgContext: (...args: unknown[]) => load(...args),
}));
vi.mock("@/lib/ai/run-task", () => ({ runAiTask: (...args: unknown[]) => run(...args) }));

import { POST as legacy } from "@/app/api/ai/analyze-github/route";
import { POST } from "@/app/api/ai/suggest-link-org/route";
import { LINK_ORG_SYSTEM } from "@/lib/ai/tasks/suggest-link-org";

const result = {
  title: "书签工具",
  note: "管理收藏资料。",
  folders: [{ folderId: null, name: "Inbox", reason: "暂存" }],
  tags: [{ tagId: "t", name: "工具", reason: "用途" }],
};
const context = {
  link: { title: null, note: "旧备注", folderId: null },
  revision: 3,
  assigned: [],
  catalogs: { folders: [], tags: [{ id: "t", name: "工具" }] },
  prompt: "complete stored data",
  supplied: ["URL"],
  notices: ["README 未收录"],
  historicalAnalysis: null,
};
const db = { getAiSettings: vi.fn() };
const request = (body: unknown = { linkId: 1 }, stream = true) =>
  new Request("https://example.com/api/ai/suggest-link-org", {
    method: "POST",
    headers: { accept: stream ? "application/x-ndjson" : "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ db, userId: "owner" });
  load.mockResolvedValue(context);
  db.getAiSettings.mockResolvedValue({ provider: "custom", apiKey: "secret", model: "model" });
  run.mockImplementation(async (_settings, options) => ({
    ok: true,
    result: options.parse(JSON.stringify(result)),
    durationMs: 100,
    rawText: JSON.stringify(result),
  }));
});
async function events(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
describe("one AI organization route", () => {
  it("shares the exact handler with the legacy GitHub URL", () => expect(legacy).toBe(POST));
  it("reports real ordered stages, supplies editable context, and never saves on generation", async () => {
    const response = await POST(request({ linkId: 1, userId: "other", readme: "injected" }));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const output = await events(response);
    expect(output.map((e) => e.type)).toEqual(["stage", "context", "stage", "stage", "result"]);
    expect(output.filter((e) => e.type === "stage").map((e) => e.stage)).toEqual([
      "prepare",
      "request",
      "parse",
    ]);
    expect(load).toHaveBeenCalledWith(db, "owner", 1);
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ system: LINK_ORG_SYSTEM, prompt: context.prompt }),
    );
    expect(output[1]).toMatchObject({ notices: context.notices, current: { note: "旧备注" } });
    expect(output.at(-1).result).toEqual(result);
    expect(JSON.stringify(output)).not.toContain("secret");
  });
  it("keeps a JSON transport using the same optional-source task", async () => {
    expect(await (await POST(request(undefined, false))).json()).toMatchObject(result);
  });
  it.each([0, -1, 1.5, "1", null])("rejects invalid IDs %s", async (id) =>
    expect((await POST(request({ linkId: id }))).status).toBe(400),
  );
  it("requires authentication", async () => {
    auth.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(load).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON", async () => {
    expect(
      (await POST(new Request("https://example.com", { method: "POST", body: "{" }))).status,
    ).toBe(400);
  });
  it("reports absent links and configuration without calling the model", async () => {
    load.mockResolvedValueOnce(null);
    expect((await events(await POST(request()))).at(-1).reason).toBe("not_found");
    db.getAiSettings.mockResolvedValue({});
    expect((await events(await POST(request()))).at(-1).reason).toBe("no_ai_config");
    expect(run).not.toHaveBeenCalled();
  });
  it.each(["timeout", "parse_error", "ai_error"])("reports %s without a result", async (reason) => {
    run.mockResolvedValue({ ok: false, reason, message: "failure", rawText: "bad reply" });
    const output = await events(await POST(request()));
    expect(output.at(-1)).toMatchObject({ type: "error", reason, rawText: "bad reply" });
    expect(output.some((e) => e.type === "result")).toBe(false);
  });
  it("reports preparation failures", async () => {
    load.mockRejectedValue(new Error("database"));
    expect((await events(await POST(request()))).at(-1).reason).toBe("prepare_error");
  });
});
