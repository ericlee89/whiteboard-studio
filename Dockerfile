# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
ENV DO_NOT_TRACK=1 AGENT_NATIVE_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN npm install --global pnpm@10.29.1
WORKDIR /app

FROM base AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY engine/package.json engine/package-lock.json ./engine/
RUN pnpm install --frozen-lockfile \
    && npm --prefix engine ci --ignore-scripts
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=4317 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:${PNPM_HOME}:${PATH}"
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg python3 python3-venv fontconfig fonts-noto-cjk \
    && python3 -m venv /opt/venv \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-docker.txt /tmp/requirements-docker.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements-docker.txt
# Keep the original engine, runtime scripts and migration toolchain beside the
# production server: the renderer creates isolated snapshots from these files.
COPY --from=build --chown=node:node /app /app
RUN /app/engine/node_modules/.bin/playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data /app/.agent-native \
    && chown node:node /app \
    && chown -R node:node /app/data /app/.agent-native \
    && chmod -R a+rX /ms-playwright
USER node
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD ["node", "scripts/docker/healthcheck.cjs"]
ENTRYPOINT ["node", "scripts/docker/entrypoint.cjs"]
