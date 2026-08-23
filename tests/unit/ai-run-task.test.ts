// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateUserAiModel = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("@/lib/ai/create-model", () => ({
  createUserAiModel: (...args: unknown[]) => mockCreateUserAiModel(...args),
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

import { runAiTask } from "@/lib/ai/run-task";
import { SuggestParseError } from "@/models/ai-suggest-link-org";

const settings = {
  provider: "anthropic",
  apiKey: "sk-test-key-1234",
  model: "claude-sonnet-4-5",
  baseURL: null,
  sdkType: null,
  authType: null,
};

describe("runAiTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUserAiModel.mockResolvedValue({});
  });

  it("returns no_ai_config without a key", async () => {
    const result = await runAiTask({ ...settings, apiKey: null }, { prompt: "x", parse: () => 1 });
    expect(result).toMatchObject({ ok: false, reason: "no_ai_config" });
  });

  it("returns no_ai_config without a provider", async () => {
    const result = await runAiTask(
      { ...settings, provider: null },
      { prompt: "x", parse: () => 1 },
    );
    expect(result).toMatchObject({ ok: false, reason: "no_ai_config" });
  });

  it("returns parsed success", async () => {
    mockGenerateText.mockResolvedValue({ text: '{"ok":true}' });
    const result = await runAiTask(settings, {
      prompt: "x",
      parse: () => ({ folders: [], tags: [] }),
    });
    expect(result.ok).toBe(true);
  });

  it("maps timeout and parse errors", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    mockGenerateText.mockRejectedValueOnce(timeout);
    expect(await runAiTask(settings, { prompt: "x", parse: () => 1 })).toMatchObject({
      reason: "timeout",
    });

    mockGenerateText.mockResolvedValueOnce({ text: "nope" });
    expect(
      await runAiTask(settings, {
        prompt: "x",
        parse: () => {
          throw new SuggestParseError("bad");
        },
      }),
    ).toMatchObject({ reason: "parse_error" });

    mockGenerateText.mockResolvedValueOnce({ text: "{" });
    expect(
      await runAiTask(settings, {
        prompt: "x",
        parse: (text) => JSON.parse(text) as unknown,
      }),
    ).toMatchObject({ reason: "parse_error" });
  });

  it("maps abort, generic, and unknown failures", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    mockGenerateText.mockRejectedValueOnce(abort);
    expect(await runAiTask(settings, { prompt: "x", parse: () => 1 })).toMatchObject({
      reason: "timeout",
    });

    mockGenerateText.mockRejectedValueOnce(new Error("upstream"));
    expect(await runAiTask(settings, { prompt: "x", parse: () => 1 })).toMatchObject({
      reason: "ai_error",
      message: "upstream",
    });

    mockGenerateText.mockRejectedValueOnce("boom");
    expect(await runAiTask(settings, { prompt: "x", parse: () => 1 })).toMatchObject({
      reason: "ai_error",
      message: "AI 请求失败",
    });
  });
});
