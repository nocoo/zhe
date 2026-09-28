import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { R2Object } from "./client";

function config() {
  const base = process.env.D1_PROXY_URL;
  const secret = process.env.D1_PROXY_SECRET;
  if (!base || !secret) throw new Error("Local resource binding is not configured");
  const url = new URL(base);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Local resource binding must use loopback HTTP");
  return { base, secret };
}
async function request(path: string, init?: RequestInit): Promise<Response> {
  const { base, secret } = config();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Local R2 failed: ${response.status}`);
  return response;
}
export function createPresignedUploadUrl(key: string, contentType: string): string {
  const { base, secret } = config();
  const expires = String(Date.now() + 300_000);
  const signature = createHmac("sha256", secret)
    .update(`${key}\n${contentType}\n${expires}`)
    .digest("hex");
  return `${process.env.R2_PUBLIC_DOMAIN?.replace(/\/r2$/, "") || base}/upload?${new URLSearchParams({ key, expires, signature })}`;
}
export async function uploadBufferToR2(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await request(`/r2/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: Buffer.from(body),
  });
}
export async function uploadStreamToR2(
  key: string,
  body: Readable,
  contentType: string,
  size: number,
): Promise<void> {
  const init = {
    method: "PUT",
    headers: { "Content-Type": contentType, "Content-Length": String(size) },
    body: Readable.toWeb(body) as ReadableStream,
    duplex: "half",
  };
  try {
    await request(`/r2/${encodeURIComponent(key)}`, init);
  } catch (error) {
    throw body.errored ?? error;
  }
}
export async function listR2Objects(prefix = ""): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor = "";
  do {
    const response = await request(`/__local/r2?${new URLSearchParams({ prefix, cursor })}`);
    const result = (await response.json()) as { objects: R2Object[]; cursor: string | null };
    objects.push(...result.objects);
    cursor = result.cursor ?? "";
  } while (cursor);
  return objects;
}
export async function deleteR2Objects(keys: string[]): Promise<number> {
  for (let i = 0; i < keys.length; i += 1000)
    await request("/__local/r2", {
      method: "DELETE",
      body: JSON.stringify(keys.slice(i, i + 1000)),
      headers: { "Content-Type": "application/json" },
    });
  return keys.length;
}
export async function deleteR2Object(key: string): Promise<void> {
  await deleteR2Objects([key]);
}
