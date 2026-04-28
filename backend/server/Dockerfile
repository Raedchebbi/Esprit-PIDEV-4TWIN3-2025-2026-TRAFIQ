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

RUN mkdir -p /workspace/ai-engine/snapshots

COPY --from=build /workspace/server/package*.json ./
COPY --from=build /workspace/server/node_modules ./node_modules
COPY --from=build /workspace/server/dist ./dist
COPY ai-engine/cameras.json /workspace/ai-engine/cameras.json
COPY ai-engine/incidents.jsonl /workspace/ai-engine/incidents.jsonl
COPY ai-engine/vehicle_counts.json /workspace/ai-engine/vehicle_counts.json

EXPOSE 3000

CMD ["node", "dist/main.js"]
