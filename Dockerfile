# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/memory/package.json ./packages/memory/
COPY packages/engine/package.json ./packages/engine/
COPY packages/react-agent/package.json ./packages/react-agent/
COPY packages/templates/package.json ./packages/templates/
COPY packages/navigate-agent/package.json ./packages/navigate-agent/
COPY app/package.json ./app/
RUN npm ci
COPY packages/ ./packages/
COPY app/ ./app/
RUN npm run build

# Runtime stage
FROM node:22-alpine
WORKDIR /app
RUN adduser -D appuser
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/app/dist ./app/dist
COPY --from=builder /app/app/config ./app/config
COPY --from=builder /app/app/package.json ./app/
COPY package.json ./
RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser
WORKDIR /app/app
EXPOSE 3001
CMD ["node", "dist/index.js"]
