import { NextResponse } from "next/server";

export type AiErrorReason =
  | "no_ai_config"
  | "not_found"
  | "validation"
  | "ai_error"
  | "parse_error"
  | "timeout";

export function aiErrorResponse(
  error: string,
  reason: AiErrorReason,
  status: number,
): NextResponse {
  return NextResponse.json({ error, reason }, { status });
}
