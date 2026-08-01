# ---------- Stage 1: build ----------
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN npm install -g bun@1.3.3

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Nitro emits a plain Node server because vite.config.ts pins preset "node-server".
# Nitro 3 writes to dist/, older versions to .output/ — normalize to /app/out.
RUN bun run build \
  && if [ -d .output ]; then mv .output out; else mv dist out; fi \
  && test -f out/server/index.mjs

# ---------- Stage 2: runtime ----------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# ffmpeg: todo vídeo enviado é convertido para um MP4 padrão (H.264 + AAC),
# o formato que TVs, Roku e navegadores reproduzem sem falhas.
RUN apk add --no-cache libc6-compat ffmpeg && npm install -g bun@1.3.3

# Drizzle needs its CLI plus the schema to apply migrations at boot.
COPY package.json bun.lock drizzle.config.ts ./
RUN bun install --frozen-lockfile

COPY --from=builder /app/out ./out
COPY drizzle ./drizzle
COPY src/lib/db ./src/lib/db
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

RUN addgroup -g 1001 -S nodejs && adduser -S signage -u 1001 \
  && chown -R signage:nodejs /app
USER signage

EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]