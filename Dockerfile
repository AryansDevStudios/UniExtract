# ==============================================================================
# Uni Extract (UniExtract) - Multi-Stage Production Dockerfile
# ==============================================================================

# STAGE 1: Build React Frontend
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json ./
COPY client/package.json ./client/
RUN npm install --prefix client

COPY client/ ./client/
COPY scripts/ ./scripts/
COPY public/ ./public/
RUN npm run build --prefix client
RUN node scripts/sync-dist.js

# STAGE 2: Production Server Runtime
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Install system dependencies (FFmpeg, Python 3, CA certificates)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Install production Node dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy server code and build outputs
COPY server.js ./
COPY scripts/ ./scripts/
COPY yt-dlp.conf ./
COPY favicon.ico ./
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/public ./public

# Ensure directories for runtime temp, cache, and cookies mount
RUN mkdir -p /app/temp /app/cache

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
