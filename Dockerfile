# syntax=docker/dockerfile:1

# One image serves every role (web app, one-shot migrations, reminder job); compose.yaml
# chooses the command. See docs/decisions/0008-container-image-and-compose-topology.md.
#
# Debian slim rather than Alpine: Prisma's schema engine is a native binary and glibc avoids
# musl compatibility surprises. Match the Node major used in development.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# All dependencies, for building.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Production dependencies only (includes `prisma` for migrations and `tsx` for the reminder job).
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM deps AS build
COPY . .
# Prisma 7 loads prisma.config.ts, which requires DATABASE_URL, even for `generate`. This
# placeholder is used only to satisfy that check; nothing connects to it.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	# No update checks or usage pings from the Prisma CLI (no telemetry, no external calls).
	CHECKPOINT_DISABLE=1 \
	PRISMA_HIDE_UPDATE_MESSAGE=1
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
# The reminder job runs from source under tsx and imports the generated Prisma client.
COPY --from=build /app/src ./src
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
