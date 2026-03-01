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
RUN bun run build

# Next.js standalone omits instrumentation files (turbopack bug).
# Copy the instrumentation entry + its dependency chunks into standalone
# so that register() runs on server startup.
RUN cp .next/server/instrumentation.js .next/standalone/.next/server/instrumentation.js && \
    cp .next/server/instrumentation.js.map .next/standalone/.next/server/instrumentation.js.map 2>/dev/null || true
# Copy all instrumentation-specific chunks (hashed filenames change per build)
RUN for f in .next/server/chunks/*.js; do \
      basename="$(basename "$f")"; \
      [ -f ".next/standalone/.next/server/chunks/$basename" ] || \
        cp "$f" ".next/standalone/.next/server/chunks/$basename"; \
    done

# --- Stage 3: Runtime ---
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=7005
ENV HOSTNAME=0.0.0.0

# Copy built assets and dependencies
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 7005

CMD ["bun", "server.js"]
