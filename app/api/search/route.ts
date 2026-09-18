import { NextResponse } from "next/server";
import { slidingWindowCheck } from "@/lib/api/rate-limit";
import { getAuthContext } from "@/lib/auth-context";
import { SearchIndexPendingError } from "@/lib/db/scoped/search";
import { SEARCH_SOURCES, type SearchFilter } from "@/models/search";

const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return reply({ error: "请先登录" }, 401);
  if (!slidingWindowCheck(`search:${context.userId}`, 120, 60_000).allowed)
    return reply({ error: "搜索过于频繁，请稍后重试" }, 429);
  let body: { query?: unknown; source?: unknown; limit?: unknown; offset?: unknown };
  try {
    // Bound actual bytes as well as Content-Length (which a client can omit).
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "缺少搜索内容" }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 16_384) {
        await reader.cancel();
        return reply({ error: "搜索内容过长" }, 413);
      }
      chunks.push(value);
    }
    body = JSON.parse(await new Blob(chunks as BlobPart[]).text());
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return reply({ error: "无效的搜索请求" }, 400);
  }
  const { query, source = "all", limit = 20, offset = 0 } = body;
  if (
    typeof query !== "string" ||
    query.length > 2_000 ||
    (source !== "all" && !SEARCH_SOURCES.includes(source as never)) ||
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    typeof offset !== "number" ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100_000
  )
    return reply({ error: "无效的搜索参数（关键词最多 2000 字符）" }, 400);
  try {
    return reply(await context.db.search(query, source as SearchFilter, limit, offset));
  } catch (error) {
    if (error instanceof SearchIndexPendingError)
      return reply({ error: "正在更新搜索索引…", code: "index_updating" }, 503);
    return reply({ error: "暂时无法搜索，请重试" }, 503);
  }
}
