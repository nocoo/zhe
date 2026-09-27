import { timingSafeEqual } from "node:crypto";
import { executeD1Query } from "./db/d1-client";

export function localIdentityEnabled(): boolean {
  if (
    !process.env.ZHE_LOCAL_AUTH_TOKEN ||
    !["demo", "e2e"].includes(process.env.ZHE_ENVIRONMENT ?? "")
  )
    return false;
  try {
    const url = new URL(process.env.D1_PROXY_URL ?? "");
    return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function authorizeLocalIdentity(token: unknown) {
  if (!localIdentityEnabled() || typeof token !== "string") return null;
  const actual = Buffer.from(token);
  const expected = Buffer.from(process.env.ZHE_LOCAL_AUTH_TOKEN as string);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  const rows = await executeD1Query<{
    id: string;
    name: string;
    email: string;
    image: string | null;
  }>("SELECT id, name, email, image FROM users WHERE id = ? AND email = ?", [
    "e2e-test-user-id",
    "e2e@test.local",
  ]);
  return rows[0] ?? null;
}
