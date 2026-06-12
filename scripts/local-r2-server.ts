/**
 * Local R2 HTTP shim — backs presigned PUT URLs and public GET URLs for
 * L2/L3 tests when LOCAL_R2=1.
 *
 * Endpoints (all relaxed — no signature validation, key path scoped to
 * LOCAL_R2_DIR):
 *
 *   PUT  /upload?key=<path>&contentType=<mime>   write body to local fs
 *   PUT  /r2/<path>                              same as above (S3-style PUT)
 *   GET  /r2/<path>                              read file
 *   HEAD /r2/<path>                              file metadata
 *   DELETE /r2/<path>                            delete file
 *   GET  /__health                               readiness probe
 *
 * Exports startLocalR2Server() / stopLocalR2Server() for programmatic use
 * from scripts/test-stack.ts; also runnable as a standalone script.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { promises as fs } from 'fs';
import { extname } from 'path';

import {
  deleteR2Object,
  keyToPath,
  uploadBufferToR2,
} from '../lib/r2/local-fs-backend';

const DEFAULT_PORT = 18788;

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.pdf': 'application/pdf',
};

function guessMime(key: string): string {
  return MIME[extname(key).toLowerCase()] ?? 'application/octet-stream';
}

function send(res: ServerResponse, status: number, body?: string | Buffer, headers?: Record<string, string>): void {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...(headers ?? {}) });
  if (body !== undefined) res.end(body);
  else res.end();
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

function parseKey(url: string): { pathname: string; key: string | null; contentType: string | null } {
  const u = new URL(url, 'http://127.0.0.1');
  if (u.pathname === '/upload') {
    return {
      pathname: u.pathname,
      key: u.searchParams.get('key'),
      contentType: u.searchParams.get('contentType'),
    };
  }
  if (u.pathname.startsWith('/r2/')) {
    return {
      pathname: u.pathname,
      key: decodeURIComponent(u.pathname.slice('/r2/'.length)),
      contentType: null,
    };
  }
  return { pathname: u.pathname, key: null, contentType: null };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (url === '/__health' && method === 'GET') {
    send(res, 200, 'ok');
    return;
  }

  const { pathname, key, contentType } = parseKey(url);

  if (!key || (pathname !== '/upload' && !pathname.startsWith('/r2/'))) {
    send(res, 404, 'not found');
    return;
  }

  try {
    if (method === 'PUT') {
      const body = await readBody(req);
      const mime = contentType || req.headers['content-type'] || guessMime(key);
      await uploadBufferToR2(key, new Uint8Array(body), mime);
      send(res, 200, 'ok');
      return;
    }

    if (method === 'GET' || method === 'HEAD') {
      const path = keyToPath(key);
      let stat: import('fs').Stats;
      try {
        stat = await fs.stat(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          send(res, 404, 'not found');
          return;
        }
        throw err;
      }
      const headers = {
        'Content-Type': guessMime(key),
        'Content-Length': String(stat.size),
      };
      if (method === 'HEAD') {
        res.writeHead(200, headers);
        res.end();
        return;
      }
      const body = await fs.readFile(path);
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    if (method === 'DELETE') {
      await deleteR2Object(key);
      send(res, 204);
      return;
    }

    send(res, 405, `method not allowed: ${method}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send(res, 500, `local r2 error: ${msg}`);
  }
}

export interface LocalR2Server {
  port: number;
  server: Server;
}

export function startLocalR2Server(port?: number): Promise<LocalR2Server> {
  const envPort = Number.parseInt(process.env.LOCAL_R2_PORT ?? '', 10);
  const resolvedPort = port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : DEFAULT_PORT);
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('[local-r2] unhandled', err);
      try {
        res.writeHead(500);
        res.end();
      } catch {
        // ignore
      }
    });
  });
  return new Promise((doneResolve, doneReject) => {
    server.once('error', doneReject);
    server.listen(resolvedPort, '127.0.0.1', () => {
      server.removeListener('error', doneReject);
      doneResolve({ port: resolvedPort, server });
    });
  });
}

export function stopLocalR2Server(handle: LocalR2Server): Promise<void> {
  return new Promise((doneResolve) => {
    handle.server.close(() => doneResolve());
  });
}

// ─── CLI entry ──────────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number.parseInt(process.env.LOCAL_R2_PORT ?? '', 10) || DEFAULT_PORT;
  startLocalR2Server(port).then(({ port: bound }) => {
    console.log(`[local-r2] listening on http://127.0.0.1:${bound} (dir=${process.env.LOCAL_R2_DIR ?? '.test-storage/r2'})`);
    const shutdown = () => process.exit(0);
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }).catch((err) => {
    console.error('[local-r2] failed to start:', err);
    process.exit(1);
  });
}
