// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  apiKeyLast4,
  isMaskedApiKeyPlaceholder,
  isValidAuthType,
  isValidSdkType,
  toPublicAiSettings,
} from "@/models/ai-settings";

describe("apiKeyLast4", () => {
  it("returns empty for missing or empty key", () => {
    expect(apiKeyLast4(null)).toBe("");
    expect(apiKeyLast4("")).toBe("");
    expect(apiKeyLast4(undefined)).toBe("");
  });

  it("returns the whole key when shorter than 4", () => {
    expect(apiKeyLast4("ab")).toBe("ab");
  });

  it("returns the last 4 characters", () => {
    expect(apiKeyLast4("sk-test-key-1234")).toBe("1234");
  });
});

describe("isMaskedApiKeyPlaceholder", () => {
  it("rejects star masks with optional last4", () => {
    expect(isMaskedApiKeyPlaceholder("********1234", "1234")).toBe(true);
    expect(isMaskedApiKeyPlaceholder("***", "")).toBe(true);
  });

  it("allows a real key", () => {
    expect(isMaskedApiKeyPlaceholder("sk-test-key-1234", "1234")).toBe(false);
  });

  it("rejects a star prefix plus last4 that is not all alphanumeric", () => {
    expect(isMaskedApiKeyPlaceholder("****ab-c", "ab-c")).toBe(true);
  });
});

describe("toPublicAiSettings", () => {
  it("never includes apiKey and reports last4", () => {
    const pub = toPublicAiSettings({
      provider: "anthropic",
      apiKey: "sk-test-key-1234",
      model: "claude-sonnet-4-5",
      baseURL: null,
      sdkType: null,
      authType: null,
    });
    expect(pub).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      baseURL: "",
      sdkType: "",
      authType: "",
      hasApiKey: true,
      apiKeyLast4: "1234",
    });
    expect(pub).not.toHaveProperty("apiKey");
  });
});

describe("type guards", () => {
  it("accepts empty or known sdk/auth types", () => {
    expect(isValidSdkType("")).toBe(true);
    expect(isValidSdkType("openai")).toBe(true);
    expect(isValidSdkType("anthropic")).toBe(true);
    expect(isValidSdkType("other")).toBe(false);
    expect(isValidAuthType("")).toBe(true);
    expect(isValidAuthType("apiKey")).toBe(true);
    expect(isValidAuthType("bearer")).toBe(true);
    expect(isValidAuthType("basic")).toBe(false);
  });
});
