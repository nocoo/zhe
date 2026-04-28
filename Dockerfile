# --- Stage 1: Install dependencies ---
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# --- Stage 2: Build ---
FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Cap Next.js worker count and Node heap during static generation.
# Next 16 spawns more parallel workers by default; on Railway's build
# instance this can OOM (each worker holds its own ~4GB heap by default).
# See firefly#43c4a62 / #9dd42e2 for the upstream fix recipe.
ENV NEXT_WORKER_COUNT=2
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN bun run build

# --- Stage 3: Runtime ---
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7006
ENV HOSTNAME=0.0.0.0

# Copy built assets and dependencies
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 7006

CMD ["bun", "server.js"]
