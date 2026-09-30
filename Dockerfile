FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:26-alpine
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8091
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8091
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:${PORT:-8091}/health || exit 1
CMD ["node", "src/server.ts"]
