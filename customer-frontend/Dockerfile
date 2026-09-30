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

# Restrict Node memory during compilation to prevent EC2 crashes
ENV NODE_OPTIONS="--max-old-space-size=400"
RUN npm run build

# Clean out development modules before moving to production stage
RUN npm prune --production


# --- Stage 2: Final Runtime Stage ---
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next

EXPOSE 3000

CMD ["npm", "start"]
