# --- Stage 1: Install dependencies (Bun) ---
# bun install is fast and matches the lockfile. Floating oven/bun:1 is fine
# here — the install step itself is stable on Railway.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- Stage 2: Build (Node) ---
# Do NOT run `next build` under Bun on Railway.
# As of Bun 1.3.14 on Railway Metal builders, `next build` completes but Bun
# then segfaults (SIGILL / exit 132) during process teardown, failing the
# Docker RUN even though .next output is already written. Node avoids that.
# See deploy failures 2026-08-05+ (e.g. deployment 5e45554d).
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Cap Next.js worker count and Node heap during static generation.
# Next 16 spawns more parallel workers by default; on Railway's build
# instance this can OOM (each worker holds its own ~4GB heap by default).
# See firefly#43c4a62 / #9dd42e2 for the upstream fix recipe.
ENV NEXT_WORKER_COUNT=2
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN node node_modules/next/dist/bin/next build

# --- Stage 3: Runtime (Node) ---
# Next.js standalone server.js is the Node production entrypoint.
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7006
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 7006

CMD ["node", "server.js"]
