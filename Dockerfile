FROM node:22.23.1-bookworm-slim AS base

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies

COPY package.json package-lock.json .npmrc ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
ENV APP_ENV=test \
    DEPLOYMENT_VERSION=container-build \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=container-build-secret-with-at-least-thirty-two-characters \
    APP_URL=http://localhost:3000 \
    NEXT_PUBLIC_APP_URL=http://localhost:3000 \
    PRIVATE_STORAGE_ROOT=/tmp/horeca-private \
    DEMO_AUTH_ENABLED=true \
    RATE_LIMIT_MODE=memory \
    RATE_LIMIT_ALLOW_IN_MEMORY=true \
    MALWARE_SCAN_MODE=mock
RUN npm run build

FROM base AS migration

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
USER node
CMD ["npm", "run", "db:deploy"]

FROM base AS runner

ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/Gardishan/Horeca" \
      org.opencontainers.image.revision="${VCS_REF}"

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app nextjs \
    && mkdir -p /app/storage/private /app/.next \
    && chown -R nextjs:nodejs /app/storage /app/.next

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

ENV NODE_ENV=production \
    APP_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

USER nextjs
EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
