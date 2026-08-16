# ---- Base: pin Node + enable Corepack/pnpm -------------------------------
FROM node:22.20.0-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- Deps: install with the frozen lockfile ------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Build: produce the standalone server --------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next telemetry off + standalone output (set in next.config.ts).
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
# The standalone server does NOT copy public/ or .next/static by default —
# place them where server.js expects to serve them from.
RUN cp -r public .next/standalone/ \
 && cp -r .next/static .next/standalone/.next/static

# ---- Runtime: minimal image running node server.js -----------------------
FROM node:22.20.0-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as an unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone bundle already contains the traced node_modules subset + server.js.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
