# Build stage
FROM node:20-alpine AS builder

# Install system dependencies
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files AND prisma schema (needed for postinstall)
COPY package.json .npmrc ./
COPY prisma ./prisma

# CRITICAL: Force exact Prisma 6.17.1 installation
# Remove any existing node_modules and package-lock to start fresh
RUN rm -rf node_modules package-lock.json

# Install ONLY Prisma packages first with exact versions
RUN npm install --save-exact --no-save prisma@6.17.1 @prisma/client@6.17.1 --legacy-peer-deps

# Now install all other dependencies (Prisma won't be upgraded)
RUN npm install --legacy-peer-deps

# Copy only necessary files for build (improves cache hit rate)
COPY next.config.ts ./
COPY tsconfig.json ./
COPY postcss.config.js ./
COPY eslint.config.mjs ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY styles ./styles
COPY public ./public
COPY types ./types
COPY middleware.ts ./

# Build the application (prisma generate already ran in postinstall)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl wget

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
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node", "server.js"]
