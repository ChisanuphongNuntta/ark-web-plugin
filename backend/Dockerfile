# Backend Development Dockerfile - Optimized for Hot Reload
FROM oven/bun:1.2-debian

WORKDIR /app

# Install OpenSSL for Prisma (minimal layer)
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install dependencies (cached layer)
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy prisma schema and generate client
COPY prisma ./prisma
COPY scripts ./scripts
RUN bunx prisma generate

# Don't copy source - it's mounted as volume for hot reload

EXPOSE 3001

# Use bun with watch mode for hot reload
CMD ["bun", "--watch", "run", "src/index.ts"]
