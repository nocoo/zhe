import { BUILTIN_PROVIDERS, type BuiltinProvider, isValidProvider } from "@nocoo/next-ai";
import { NextResponse } from "next/server";
import { aiErrorResponse } from "@/lib/ai/errors";
import { getScopedDB } from "@/lib/auth-context";
import type { AiSettingsData } from "@/lib/db/scoped/settings";
import { assertSafeAiBaseUrl, UnsafeAiBaseUrlError } from "@/models/ai-base-url";
import {
  isMaskedApiKeyPlaceholder,
  isValidAuthType,
  isValidSdkType,
  toPublicAiSettings,
} from "@/models/ai-settings";

export const dynamic = "force-dynamic";

async function requireDb() {
  const db = await getScopedDB();
  if (!db) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { db };
}

export async function GET(): Promise<Response> {
  const auth = await requireDb();
  if ("error" in auth) return auth.error;

  const stored = await auth.db.getAiSettings();
  return NextResponse.json(toPublicAiSettings(stored));
}

const STRING_FIELDS = ["provider", "model", "baseURL", "sdkType", "authType"] as const;

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(rec: Record<string, unknown>, key: string): string | undefined {
  const value = rec[key];
  return typeof value === "string" ? value : undefined;
}

function fieldTypeError(raw: Record<string, unknown>): string | null {
  for (const key of STRING_FIELDS) {
    if (key in raw && raw[key] !== undefined && typeof raw[key] !== "string") {
      return `字段 ${key} 格式无效`;
    }
  }
  if (
    "apiKey" in raw &&
    raw.apiKey !== undefined &&
    raw.apiKey !== null &&
    typeof raw.apiKey !== "string"
  ) {
    return "密钥格式无效";
  }
  return null;
}

function enumError(raw: Record<string, unknown>): string | null {
  const provider = readString(raw, "provider");
  if (provider !== undefined && provider !== "" && !isValidProvider(provider)) {
    return `不支持的供应商：${provider}`;
  }
  const sdkType = readString(raw, "sdkType");
  if (sdkType !== undefined && !isValidSdkType(sdkType)) {
    return `协议类型无效：${sdkType}`;
  }
  const authType = readString(raw, "authType");
  if (authType !== undefined && !isValidAuthType(authType)) {
    return `鉴权类型无效：${authType}`;
  }
  return null;
}

function mergeAiSettings(
  stored: AiSettingsData,
  raw: Record<string, unknown>,
): { ok: true; data: AiSettingsData } | { ok: false; error: string } {
  const next: AiSettingsData = { ...stored };
  if ("provider" in raw) next.provider = readString(raw, "provider") || null;
  if ("model" in raw) next.model = readString(raw, "model") || null;
  if ("baseURL" in raw) next.baseURL = readString(raw, "baseURL") || null;
  if ("sdkType" in raw) next.sdkType = readString(raw, "sdkType") || null;
  if ("authType" in raw) next.authType = readString(raw, "authType") || null;

  if (raw.apiKey === null) {
    next.apiKey = null;
  } else if (typeof raw.apiKey === "string") {
    if (isMaskedApiKeyPlaceholder(raw.apiKey, stored.apiKey?.slice(-4) ?? "")) {
      return { ok: false, error: "请输入完整密钥，不要提交掩码" };
    }
    next.apiKey = raw.apiKey;
  }

  if (next.provider && next.provider !== "custom" && !next.model) {
    const info = BUILTIN_PROVIDERS[next.provider as BuiltinProvider];
    if (!info?.defaultModel) {
      return { ok: false, error: "请选择模型" };
    }
    next.model = info.defaultModel;
  }
  return { ok: true, data: next };
}

async function validateMergedCustom(next: AiSettingsData): Promise<Response | null> {
  if (next.provider !== "custom") {
    next.baseURL = "";
    next.sdkType = "";
    next.authType = "";
    return null;
  }
  if (!next.baseURL || !next.sdkType || !next.authType || !next.model) {
    return aiErrorResponse("自定义供应商需要填写接口地址、协议、鉴权和模型", "validation", 400);
  }
  try {
    await assertSafeAiBaseUrl(next.baseURL);
    return null;
  } catch (error) {
    const message = error instanceof UnsafeAiBaseUrlError ? error.message : "接口地址无效";
    return aiErrorResponse(message, "validation", 400);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await requireDb();
  if ("error" in auth) return auth.error;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return aiErrorResponse("请求体不是有效 JSON", "validation", 400);
  }
  if (!isJsonRecord(raw)) {
    return aiErrorResponse("请求体不是有效 JSON", "validation", 400);
  }

  const typeError = fieldTypeError(raw);
  if (typeError) return aiErrorResponse(typeError, "validation", 400);
  const valueError = enumError(raw);
  if (valueError) return aiErrorResponse(valueError, "validation", 400);

  const stored = await auth.db.getAiSettings();
  const merged = mergeAiSettings(stored, raw);
  if (!merged.ok) return aiErrorResponse(merged.error, "validation", 400);

  const customError = await validateMergedCustom(merged.data);
  if (customError) return customError;

  const saved = await auth.db.upsertAiSettings(merged.data);
  return NextResponse.json(
    toPublicAiSettings({
      provider: saved.aiProvider,
      apiKey: saved.aiApiKey,
      model: saved.aiModel,
      baseURL: saved.aiBaseUrl,
      sdkType: saved.aiSdkType,
      authType: saved.aiAuthType,
    }),
  );
}
