# Production image for Educational Center ERP (single-origin service).
# Builds the SPA + Fastify API + Socket.io and serves them from one container.
# Carries the Prisma CLI + PostgreSQL client tools so containers can run
# `prisma migrate deploy` at startup and `pg_dump`/`pg_restore` for operators.

FROM node:20-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /srv/app

# ---------------------------------------------------------------------------
# Build stage: install all deps (incl. dev) and compile the app
# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build:production

# ---------------------------------------------------------------------------
# Production stage: runtime deps + Prisma CLI (for migrate deploy) + generated
# client + PostgreSQL client tools (for ops: pg_dump/pg_restore)
# ---------------------------------------------------------------------------
FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# prisma (CLI) is a devDependency; install it so `prisma migrate deploy` works
# at container start, then regenerate the client for this platform.
COPY prisma ./prisma
RUN npm ci --omit=dev \
  && npm install --no-save "prisma@^5.19.1" \
  && npx prisma generate

COPY --from=build /srv/app/dist ./dist

# Non-privileged user for the web process
RUN useradd --create-home appuser \
  && chown -R appuser:appuser /srv/app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are applied at container start (not build) so the image is reusable
# across environments. The deployment entrypoint (and start:production) runs:
#   prisma migrate deploy && node dist/server/server/server.js
# Must be `migrate deploy`, never `db push`. `prisma db push --accept-data-loss`
# reconciles the database by running DDL straight from schema.prisma and is
# explicitly permitted to drop columns and tables to make the shapes match, so a
# later edit that removes a field would silently delete real student and payment
# data on the next deploy. Migrations force that decision to be written down as
# reviewable SQL. A dev shortcut that reached this file in 7d2369a, and the
# comment above already said migrate deploy, so nothing reviewed the difference.
# tests/production-safety.test.ts pins this.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server/server/server.js"]