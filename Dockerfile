# Build stage
FROM node:20-alpine AS builder

# Install system dependencies
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files AND prisma schema (needed for postinstall)
COPY package.json package-lock.json* pnpm-lock.yaml* ./
COPY prisma ./prisma

# Install dependencies using npm (more reliable in Docker)
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy rest of application code
COPY . .

# Build the application (prisma generate already ran in postinstall)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/package.json ./package.json

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]
