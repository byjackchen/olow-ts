# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json ./packages/engine/
COPY apps/olow-app/package.json ./apps/olow-app/
RUN npm ci
COPY packages/engine/ ./packages/engine/
COPY apps/olow-app/ ./apps/olow-app/
RUN npm run build --workspace=@olow/engine && npm run build --workspace=olow-app

# Runtime stage
FROM node:22-alpine
WORKDIR /app
RUN adduser -D appuser
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/engine/dist ./packages/engine/dist
COPY --from=builder /app/packages/engine/package.json ./packages/engine/
COPY --from=builder /app/apps/olow-app/dist ./apps/olow-app/dist
COPY --from=builder /app/apps/olow-app/config ./apps/olow-app/config
COPY --from=builder /app/apps/olow-app/package.json ./apps/olow-app/
COPY package.json ./
RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser
WORKDIR /app/apps/olow-app
EXPOSE 3001
CMD ["node", "dist/main.js"]
