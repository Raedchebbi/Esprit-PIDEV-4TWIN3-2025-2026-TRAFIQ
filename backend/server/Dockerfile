# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /workspace/server

# Copy the manifest files first so dependency installation can be cached.
COPY server/package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /workspace/server

COPY --from=deps /workspace/server/node_modules ./node_modules
COPY server ./

RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /workspace/server

ENV NODE_ENV=production

RUN addgroup -g 1001 -S trafiq \
    && adduser -S trafiq -u 1001 -G trafiq \
    && mkdir -p /workspace/ai-engine/snapshots /workspace/server/data \
    && chown -R trafiq:trafiq /workspace

COPY --chown=trafiq:trafiq --from=build /workspace/server/package*.json ./
COPY --chown=trafiq:trafiq --from=build /workspace/server/node_modules ./node_modules
COPY --chown=trafiq:trafiq --from=build /workspace/server/dist ./dist
COPY --chown=trafiq:trafiq ai-engine/cameras.json /workspace/ai-engine/cameras.json
COPY --chown=trafiq:trafiq ai-engine/incidents.jsonl /workspace/ai-engine/incidents.jsonl
COPY --chown=trafiq:trafiq ai-engine/vehicle_counts.json /workspace/ai-engine/vehicle_counts.json

USER trafiq

EXPOSE 3000

CMD ["node", "dist/main.js"]
