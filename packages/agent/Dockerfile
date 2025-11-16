# Multi-stage build for smaller final image
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./

# Copy all package.json files first for better caching
COPY packages/domain/package.json ./packages/domain/
COPY packages/agent/package.json ./packages/agent/

# Install pnpm
RUN npm install -g pnpm@9.15.4

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @crate/agent...

# Copy source code
COPY packages/domain ./packages/domain
COPY packages/agent ./packages/agent
COPY tsconfig.base.json ./

# Build domain first, then agent
RUN pnpm --filter @crate/domain build
RUN pnpm --filter @crate/agent build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/packages/agent/dist ./dist
COPY --from=builder /app/packages/agent/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# Set environment
ENV NODE_ENV=production
ENV FAISS_API_URL=http://localhost:8000

# Run agent
CMD ["node", "dist/server.js"]
