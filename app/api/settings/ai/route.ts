import { isValidProvider } from "@nocoo/next-ai";
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

interface PutBody {
  provider?: string;
  apiKey?: string | null;
  model?: string;
  baseURL?: string;
  sdkType?: string;
  authType?: string;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await requireDb();
  if ("error" in auth) return auth.error;

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return aiErrorResponse("Invalid JSON body", "validation", 400);
  }

  if (body.provider !== undefined && body.provider !== "" && !isValidProvider(body.provider)) {
    return aiErrorResponse(`Invalid provider: ${body.provider}`, "validation", 400);
  }
  if (body.sdkType !== undefined && !isValidSdkType(body.sdkType)) {
    return aiErrorResponse(`Invalid SDK type: ${body.sdkType}`, "validation", 400);
  }
  if (body.authType !== undefined && !isValidAuthType(body.authType)) {
    return aiErrorResponse(`Invalid auth type: ${body.authType}`, "validation", 400);
  }
  if (body.apiKey !== undefined && body.apiKey !== null && typeof body.apiKey !== "string") {
    return aiErrorResponse("Invalid API key", "validation", 400);
  }

  const stored = await auth.db.getAiSettings();
  const next: AiSettingsData = { ...stored };

  if (body.provider !== undefined) next.provider = body.provider || null;
  if (body.model !== undefined) next.model = asOptionalString(body.model) || null;
  if (body.baseURL !== undefined) next.baseURL = asOptionalString(body.baseURL) || null;
  if (body.sdkType !== undefined) next.sdkType = asOptionalString(body.sdkType) || null;
  if (body.authType !== undefined) next.authType = asOptionalString(body.authType) || null;

  if (body.apiKey === null) {
    next.apiKey = null;
  } else if (typeof body.apiKey === "string") {
    if (isMaskedApiKeyPlaceholder(body.apiKey, stored.apiKey?.slice(-4) ?? "")) {
      return aiErrorResponse("refusing masked placeholder", "validation", 400);
    }
    next.apiKey = body.apiKey;
  }

  if (next.provider !== "custom") {
    next.baseURL = "";
    next.sdkType = "";
    next.authType = "";
  } else {
    if (!next.baseURL || !next.sdkType || !next.authType || !next.model) {
      return aiErrorResponse(
        "Custom provider requires baseURL, sdkType, authType, and model",
        "validation",
        400,
      );
    }
    try {
      await assertSafeAiBaseUrl(next.baseURL);
    } catch (error) {
      const message = error instanceof UnsafeAiBaseUrlError ? error.message : "Invalid base URL";
      return aiErrorResponse(message, "validation", 400);
    }
  }

  const saved = await auth.db.upsertAiSettings(next);
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
