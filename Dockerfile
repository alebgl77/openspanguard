FROM node:22.23.4-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY examples ./examples
COPY test ./test
RUN npm run build && npm prune --omit=dev

FROM node:22.23.4-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json LICENSE ./
USER node
EXPOSE 4318
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12 CMD node -e "fetch('http://127.0.0.1:4318/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/index.js"]
