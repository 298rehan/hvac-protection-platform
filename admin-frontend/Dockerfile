# --- Stage 1: Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./

# Limit npm memory usage and download overhead
RUN npm ci --quiet --no-audit --no-fund

COPY . .
# Run build with limited Node memory to prevent EC2 freezing
ENV NODE_OPTIONS="--max-old-space-size=450"
RUN npm run build

# Clean up development dependencies to save final image space
RUN npm prune --production


# --- Stage 2: Final Runtime Stage ---
FROM node:20-alpine
WORKDIR /app

# Copy only what is strictly necessary from the builder stage
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist 
# Note: If your build output goes to a folder named '.next' or 'build' instead of 'dist', change '/app/dist' above to match it.

EXPOSE 3000
CMD ["npm", "start"]
