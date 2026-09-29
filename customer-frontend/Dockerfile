# --- Stage 1: Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package configurations first to leverage caching
COPY package*.json ./

# Force npm to use minimal memory and prevent network timeout hangs
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm ci --quiet --no-audit --no-fund --maxsockets 3

COPY . .

# CRUCIAL: Strongly restrict Node memory during compilation to prevent EC2 crashes
ENV NODE_OPTIONS="--max-old-space-size=400 --initial-old-space-size=100"
RUN npm run build

# Clean out development modules before moving to production stage
RUN npm prune --production


# --- Stage 2: Final Runtime Stage ---
FROM node:20-alpine
WORKDIR /app

# Copy production configurations and build files
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# IMPORTANT NOTE FOR COPYING FILES:
# If you are using standard React/Vite, it outputs to '/app/dist'
# If you are using Next.js, change '/app/dist' to '/app/.next'
# If you are using standard Next.js, you might also need to copy '/app/public'
COPY --from=builder /app/dist ./dist 

EXPOSE 3000

CMD ["npm", "start"]
