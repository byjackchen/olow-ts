# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/memory/package.json ./packages/memory/
COPY packages/engine/package.json ./packages/engine/
COPY packages/templates/package.json ./packages/templates/
COPY packages/react-agent/package.json ./packages/react-agent/
COPY packages/messengers/package.json ./packages/messengers/
COPY apps/olow-chatbot/package.json ./apps/olow-chatbot/
RUN npm ci
COPY packages/ ./packages/
COPY apps/olow-chatbot/ ./apps/olow-chatbot/
RUN npm run build -w @olow/types && npm run build -w @olow/memory && npm run build -w @olow/engine && npm run build -w @olow/templates && npm run build -w @olow/messengers && npm run build -w @olow/react-agent && npm run build -w olow-chatbot

# Runtime stage
FROM node:22-alpine
WORKDIR /app
RUN adduser -D appuser
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/olow-chatbot/dist ./apps/olow-chatbot/dist
COPY --from=builder /app/apps/olow-chatbot/config ./apps/olow-chatbot/config
COPY --from=builder /app/apps/olow-chatbot/package.json ./apps/olow-chatbot/
COPY package.json ./
RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser
WORKDIR /app/apps/olow-chatbot
EXPOSE 3000
CMD ["node", "dist/index.js"]
