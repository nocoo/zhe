import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type IncomingMessage } from "node:http";
import { createServer as createNetServer } from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { terminateChild } from "./lib/crash-shutdown";
import {
  type EnvironmentMode,
  initialMode,
  isEnvironmentMode,
  PREFERENCE_KEY,
} from "./lib/environment-mode";

const args = process.argv.slice(2);
const explicit = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : undefined;
if (explicit !== undefined && !isEnvironmentMode(explicit))
  throw new Error("Expected --mode demo|e2e|prod");
const port = Number(args.includes("--port") ? args[args.indexOf("--port") + 1] : 7006);
const origin = port === 7006 ? "https://zhe.dev.hexly.ai" : `http://localhost:${port}`;
const allowedHosts = new Set([new URL(origin).host, `localhost:${port}`, `127.0.0.1:${port}`]);
type Instance = {
  id: string;
  mode: EnvironmentMode;
  target: string;
  resourceTarget: string;
  child: ChildProcess;
};
let active: Instance | undefined;
let switching = false;
const allocatedPorts = new Set<number>();
async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cannot allocate port");
  await new Promise<void>((done) => server.close(() => done()));
  if (allocatedPorts.has(address.port)) return freePort();
  allocatedPorts.add(address.port);
  return address.port;
}
async function start(mode: EnvironmentMode): Promise<Instance> {
  const [appPort, workerPort] = await Promise.all([freePort(), freePort()]);
  const id = randomUUID();
  const child = spawn("bun", ["run", "scripts/local-app.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ZHE_RUN_ID: id,
      ZHE_ENVIRONMENT: mode,
      ZHE_LOCAL_INSTANCE: id,
      ZHE_LOCAL_ORIGIN: origin,
      ZHE_LOCAL_APP_PORT: String(appPort),
      ZHE_TEST_WORKER_PORT: String(workerPort),
      ZHE_LAUNCH_INTENT: "interactive",
      ZHE_LOCAL_BUILD: args.includes("--build") ? "1" : "",
    },
  });
  const target = `http://127.0.0.1:${appPort}`;
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error("Local instance exited during startup");
      try {
        const response = await fetch(`${target}/api/health`);
        if (response.ok)
          return { id, mode, target, resourceTarget: `http://127.0.0.1:${workerPort}`, child };
      } catch {}
      await new Promise((done) => setTimeout(done, 250));
    }
    throw new Error("Local instance startup timed out");
  } catch (error) {
    await terminateChild(child, 10_000);
    throw error;
  }
}
async function body(request: IncomingMessage): Promise<string> {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 2048) throw new Error("Request too large");
  }
  return value;
}
const server = createServer(async (req, res) => {
  try {
    if (!allowedHosts.has(req.headers.host ?? "")) {
      res.writeHead(403).end();
      return;
    }
    const path = req.url ?? "/";
    const method = req.method ?? "GET";
    if (path === "/_local/select" && method === "POST") {
      if (req.headers.origin !== origin && req.headers.origin !== `http://${req.headers.host}`) {
        res.writeHead(403).end();
        return;
      }
      if (switching) {
        res.writeHead(409).end("Switch already in progress");
        return;
      }
      const choice = JSON.parse(await body(req));
      if (!isEnvironmentMode(choice.mode)) {
        res.writeHead(400).end();
        return;
      }
      if (active && req.headers["x-zhe-instance"] !== active.id) {
        res.writeHead(410).end("Instance expired; reload");
        return;
      }
      switching = true;
      const previous = active;
      active = undefined;
      try {
        if (previous) await terminateChild(previous.child, 15_000);
        active = await start(
          previous ? choice.mode : initialMode("interactive", explicit, choice.mode),
        );
        res
          .writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" })
          .end(JSON.stringify({ mode: active.mode }));
      } finally {
        switching = false;
      }
      return;
    }
    const instance = active;
    if (!instance) {
      if (switching) {
        res.writeHead(503).end("Starting local environment");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      res.end(
        `<!doctype html><html><body><p>Starting Zhe…</p><script>(async()=>{let mode='demo';try{mode=localStorage.getItem(${JSON.stringify(PREFERENCE_KEY)})||mode;}catch{}if(!['demo','e2e','prod'].includes(mode))mode='demo';const r=await fetch('/_local/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})});if(!r.ok)throw new Error(await r.text());location.replace('/');})().catch(e=>document.querySelector('p').textContent=e.message)</script></body></html>`,
      );
      return;
    }
    const requestId = req.headers["x-zhe-instance"];
    if (
      (requestId && requestId !== instance.id) ||
      (!["GET", "HEAD", "OPTIONS"].includes(method) && requestId !== instance.id)
    ) {
      res.writeHead(410).end("Instance expired; reload");
      return;
    }
    const mediaPrefix = `/_local/media/${instance.mode === "demo" ? "demo" : instance.id}`;
    const isMedia = path.startsWith("/_local/media/");
    if (isMedia && !path.startsWith(`${mediaPrefix}/`)) {
      res.writeHead(410).end("Media instance expired");
      return;
    }
    const upstreamTarget = isMedia ? instance.resourceTarget : instance.target;
    const upstreamPath = isMedia ? path.slice(mediaPrefix.length) : path;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (
        value !== undefined &&
        !["host", "connection", "transfer-encoding", "accept-encoding"].includes(key)
      )
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.set("host", new URL(isMedia ? upstreamTarget : origin).host);
    headers.set("x-forwarded-host", new URL(origin).host);
    headers.set("x-forwarded-proto", new URL(origin).protocol.slice(0, -1));
    const response = await fetch(`${upstreamTarget}${upstreamPath}`, {
      method,
      headers,
      redirect: "manual",
      ...(!["GET", "HEAD"].includes(method)
        ? { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }
        : {}),
    });
    for (const [key, value] of response.headers)
      if (!["transfer-encoding", "content-encoding", "content-length", "set-cookie"].includes(key))
        res.setHeader(key, value);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.statusCode = response.status;
    if (response.headers.get("content-type")?.includes("text/html")) {
      res.setHeader("cache-control", "no-store");
      res.end(await response.text());
    } else if (response.body)
      await pipeline(
        Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        res,
      );
    else res.end();
  } catch (error) {
    if (res.destroyed) return;
    console.error(error);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Local environment failed; no production fallback");
  }
});
server.on("upgrade", (req, socket, head) => {
  const instance = active;
  if (!instance || !allowedHosts.has(req.headers.host ?? "") || !req.url?.startsWith("/_next/")) {
    socket.destroy();
    return;
  }
  const upstream = httpRequest(`${instance.target}${req.url}`, { headers: req.headers });
  upstream.on("upgrade", (response, peer, peerHead) => {
    socket.write(`HTTP/1.1 ${response.statusCode} Switching Protocols\r\n`);
    for (const [key, value] of Object.entries(response.headers))
      socket.write(`${key}: ${value}\r\n`);
    socket.write("\r\n");
    if (head.length) peer.write(head);
    if (peerHead.length) socket.write(peerHead);
    socket.pipe(peer).pipe(socket);
    peer.on("error", () => socket.destroy());
    socket.on("error", () => peer.destroy());
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
});
server.listen(port, "127.0.0.1", () => console.log(`Local Zhe: ${origin}`));
async function stop() {
  server.close();
  if (active) await terminateChild(active.child, 15_000);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
