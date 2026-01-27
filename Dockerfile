FROM node:25-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:25-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY --from=build /app/dist ./dist

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:9000/healthz || exit 1

CMD ["node", "dist/server.js"]
