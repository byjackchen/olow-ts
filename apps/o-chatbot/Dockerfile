# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/memory/package.json ./packages/memory/
COPY packages/engine/package.json ./packages/engine/
COPY packages/react-agent/package.json ./packages/react-agent/
COPY packages/messengers/package.json ./packages/messengers/
COPY apps/o-chatbot/package.json ./apps/o-chatbot/
RUN npm ci
COPY packages/ ./packages/
COPY apps/o-chatbot/ ./apps/o-chatbot/
RUN npm run build -w @olow/memory && npm run build -w @olow/engine && npm run build -w @olow/messengers && npm run build -w @olow/react-agent && npm run build -w o-chatbot

# Runtime stage
FROM node:22-alpine
WORKDIR /app
RUN adduser -D appuser
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/o-chatbot/dist ./apps/o-chatbot/dist
COPY --from=builder /app/apps/o-chatbot/config ./apps/o-chatbot/config
COPY --from=builder /app/apps/o-chatbot/package.json ./apps/o-chatbot/
COPY package.json ./
RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser
WORKDIR /app/apps/o-chatbot
EXPOSE 3000
CMD ["node", "dist/index.js"]
