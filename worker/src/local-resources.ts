import edge, { type Env } from "./index";

type LocalEnv = Env & { LOCAL_BUCKET: R2Bucket };
const encoder = new TextEncoder();
async function signature(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function listing(request: Request, env: LocalEnv, url: URL): Promise<Response> {
  if (request.method === "GET") {
    const result = await env.LOCAL_BUCKET.list({
      prefix: url.searchParams.get("prefix") ?? "",
      ...(url.searchParams.get("cursor")
        ? { cursor: url.searchParams.get("cursor") as string }
        : {}),
    });
    return Response.json({
      objects: result.objects.map((object) => ({
        key: object.key,
        size: object.size,
        lastModified: object.uploaded.toISOString(),
      })),
      cursor: result.truncated ? result.cursor : null,
    });
  }
  if (request.method === "DELETE") {
    const keys = await request.json<string[]>();
    if (!Array.isArray(keys) || keys.length > 1000 || keys.some((key) => typeof key !== "string"))
      return new Response("Invalid keys", { status: 400 });
    await env.LOCAL_BUCKET.delete(keys);
    return Response.json({ deleted: keys.length });
  }
  return new Response("Unsupported method", { status: 405 });
}
async function object(
  request: Request,
  env: LocalEnv,
  url: URL,
  authorized: boolean,
): Promise<Response> {
  const key =
    url.pathname === "/upload"
      ? url.searchParams.get("key")
      : decodeURIComponent(url.pathname.slice(4));
  if (!key || key.split("/").includes("..")) return new Response("Invalid key", { status: 400 });
  if (request.method === "PUT") {
    const expires = url.searchParams.get("expires") ?? "";
    const contentType = request.headers.get("content-type") ?? "application/octet-stream";
    const signed = `${key}\n${contentType}\n${expires}`;
    if (
      !authorized &&
      (Number(expires) < Date.now() ||
        Number(expires) > Date.now() + 300_000 ||
        url.searchParams.get("signature") !== (await signature(env.D1_PROXY_SECRET, signed)))
    )
      return new Response("Invalid upload signature", { status: 403 });
    if (!request.body) return new Response("Missing body", { status: 400 });
    await env.LOCAL_BUCKET.put(key, request.body, { httpMetadata: { contentType } });
    return new Response(null, { status: 200 });
  }
  if (request.method === "GET" || request.method === "HEAD") {
    const object = await env.LOCAL_BUCKET.get(key, { range: request.headers });
    if (!object) return new Response("Not found", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("accept-ranges", "bytes");
    if (object.range && "offset" in object.range && "length" in object.range) {
      const offset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size;
      headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set("content-length", String(length));
    } else headers.set("content-length", String(object.size));
    return new Response(request.method === "HEAD" ? null : object.body, {
      status: object.range ? 206 : 200,
      headers,
    });
  }
  return new Response("Unsupported method", { status: 405 });
}
async function kv(request: Request, env: LocalEnv, url: URL): Promise<Response> {
  const [, value] = url.pathname.split("/values/");
  if (value !== undefined) {
    const key = decodeURIComponent(value);
    if (request.method === "PUT")
      await env.LINKS_KV.put(
        key,
        await request.text(),
        url.searchParams.has("expiration")
          ? { expiration: Number(url.searchParams.get("expiration")) }
          : {},
      );
    else if (request.method === "DELETE") await env.LINKS_KV.delete(key);
    else return new Response("Unsupported method", { status: 405 });
    return Response.json({ success: true });
  }
  if (url.pathname.endsWith("/keys") && request.method === "GET") {
    const result = await env.LINKS_KV.list({
      ...(url.searchParams.get("cursor")
        ? { cursor: url.searchParams.get("cursor") as string }
        : {}),
    });
    return Response.json({
      success: true,
      result: result.keys,
      result_info: { cursor: result.list_complete ? "" : result.cursor },
    });
  }
  if (url.pathname.endsWith("/bulk")) {
    if (request.method === "DELETE") {
      for (const key of await request.json<string[]>()) await env.LINKS_KV.delete(key);
    } else if (request.method === "PUT") {
      for (const entry of await request.json<
        Array<{ key: string; value: string; expiration?: number }>
      >())
        await env.LINKS_KV.put(
          entry.key,
          entry.value,
          entry.expiration ? { expiration: entry.expiration } : {},
        );
    } else return new Response("Unsupported method", { status: 405 });
    return Response.json({ success: true });
  }
  return new Response("Not found", { status: 404 });
}
async function resources(request: Request, env: LocalEnv): Promise<Response> {
  const url = new URL(request.url);
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    return new Response("Local only", { status: 403 });
  const authorized = request.headers.get("authorization") === `Bearer ${env.D1_PROXY_SECRET}`;
  if (url.pathname.startsWith("/r2/") || url.pathname === "/upload")
    return object(request, env, url, authorized);
  if (!authorized) return new Response("Unauthorized", { status: 401 });
  if (url.pathname === "/__local/r2") return listing(request, env, url);
  return kv(request, env, url);
}
export default {
  async fetch(request: Request, env: LocalEnv, ctx: ExecutionContext) {
    const path = new URL(request.url).pathname;
    if (
      !path.startsWith("/r2/") &&
      path !== "/upload" &&
      !path.startsWith("/__local/") &&
      !path.startsWith("/client/v4/")
    )
      return edge.fetch(request, env, ctx);
    const response =
      request.method === "OPTIONS"
        ? new Response(null, { status: 204 })
        : await resources(request, env);
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, HEAD, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Range");
    return response;
  },
};
