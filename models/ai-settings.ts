export type AiSdkType = "openai" | "anthropic";
export type AiAuthType = "apiKey" | "bearer";

export interface AiSettingsPublic {
  provider: string;
  model: string;
  baseURL: string;
  sdkType: string;
  authType: string;
  hasApiKey: boolean;
  apiKeyLast4: string;
}

export interface AiSettingsStored {
  provider: string | null;
  apiKey: string | null;
  model: string | null;
  baseURL: string | null;
  sdkType: string | null;
  authType: string | null;
}

export function apiKeyLast4(key: string | null | undefined): string {
  if (!key) return "";
  return key.slice(-4);
}

export function isMaskedApiKeyPlaceholder(value: string, last4: string): boolean {
  if (/^\*+[A-Za-z0-9]{0,4}$/.test(value)) return true;
  if (last4 && value.endsWith(last4) && /^\*+$/.test(value.slice(0, -last4.length))) {
    return true;
  }
  return false;
}

export function toPublicAiSettings(stored: AiSettingsStored): AiSettingsPublic {
  return {
    provider: stored.provider ?? "",
    model: stored.model ?? "",
    baseURL: stored.baseURL ?? "",
    sdkType: stored.sdkType ?? "",
    authType: stored.authType ?? "",
    hasApiKey: Boolean(stored.apiKey),
    apiKeyLast4: apiKeyLast4(stored.apiKey),
  };
}

export function isValidSdkType(value: string): value is AiSdkType | "" {
  return value === "" || value === "openai" || value === "anthropic";
}

export function isValidAuthType(value: string): value is AiAuthType | "" {
  return value === "" || value === "apiKey" || value === "bearer";
}
