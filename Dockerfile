# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Runtime stage
FROM node:22-alpine
WORKDIR /app
RUN adduser -D appuser
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY config/ ./config/
RUN mkdir -p /app/logs && chown -R appuser:appuser /app
USER appuser
EXPOSE 5001
ENV CHATBOT_ENV=DEV
CMD ["node", "dist/main.js"]
