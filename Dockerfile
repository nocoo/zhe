# syntax=docker/dockerfile:1

FROM oven/bun:1.3.11@sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7 AS bun
FROM node:22.22.0-bookworm-slim@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Bun can segfault during Next build teardown; keep the build on Node.
# Limit static-generation memory on constrained builders.
ENV NEXT_WORKER_COUNT=2
ENV NODE_OPTIONS=--max-old-space-size=2048
RUN node node_modules/next/dist/bin/next build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=7006 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
RUN test -w .next/cache && node --unhandled-rejections=strict -e "require('sharp')({ create: { width: 1, height: 1, channels: 4, background: '#fff' } }).png().toBuffer().then(() => console.log('Sharp ready'))"

EXPOSE 7006
CMD ["node", "server.js"]
