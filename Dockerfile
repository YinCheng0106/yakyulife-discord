FROM oven/bun:1.4.2 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json bunfig.toml biome.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1.4.2-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./package.json
USER bun
CMD ["bun", "run", "start"]
