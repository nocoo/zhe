import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createAiModel, resolveAiConfig } from "@nocoo/next-ai/server";
import type { LanguageModel } from "ai";
import { assertSafeAiBaseUrl } from "@/models/ai-base-url";
import type { AiSettingsStored } from "@/models/ai-settings";

function noRedirectFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, redirect: "error" });
}

export async function createUserAiModel(settings: AiSettingsStored): Promise<LanguageModel> {
  if (!settings.provider || !settings.apiKey || !settings.model) {
    throw new Error("请先配置供应商、模型和密钥");
  }

  if (settings.provider !== "custom") {
    const input: {
      provider: string;
      apiKey: string;
      model: string;
      baseURL?: string;
      sdkType?: "openai" | "anthropic";
      authType?: "apiKey" | "bearer";
    } = {
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
    };
    if (settings.baseURL) input.baseURL = settings.baseURL;
    if (settings.sdkType === "openai" || settings.sdkType === "anthropic") {
      input.sdkType = settings.sdkType;
    }
    if (settings.authType === "bearer" || settings.authType === "apiKey") {
      input.authType = settings.authType;
    }
    return createAiModel(resolveAiConfig(input));
  }

  if (!settings.baseURL || !settings.sdkType || !settings.authType) {
    throw new Error("自定义供应商需要填写接口地址、协议和鉴权");
  }
  await assertSafeAiBaseUrl(settings.baseURL);

  if (settings.sdkType === "anthropic") {
    const anthropic =
      settings.authType === "bearer"
        ? createAnthropic({
            baseURL: settings.baseURL,
            authToken: settings.apiKey,
            fetch: noRedirectFetch,
          })
        : createAnthropic({
            baseURL: settings.baseURL,
            apiKey: settings.apiKey,
            fetch: noRedirectFetch,
          });
    return anthropic(settings.model);
  }

  const openai =
    settings.authType === "bearer"
      ? createOpenAI({
          baseURL: settings.baseURL,
          apiKey: settings.apiKey,
          headers: { Authorization: `Bearer ${settings.apiKey}` },
          fetch: noRedirectFetch,
        })
      : createOpenAI({
          baseURL: settings.baseURL,
          apiKey: settings.apiKey,
          fetch: noRedirectFetch,
        });
  return openai(settings.model);
}
