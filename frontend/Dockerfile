# Frontend Development Dockerfile - Bun + Hot Reload
FROM oven/bun:1.2-alpine

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# Copy config files (these don't change often)
COPY tsconfig.json next.config.* postcss.config.* tailwind.config.* ./

# Source is mounted as volume for hot reload

EXPOSE 3000

# Environment for performance
ENV NEXT_TELEMETRY_DISABLED=1

# Start Next.js dev server with Bun
CMD ["bun", "run", "dev"]
