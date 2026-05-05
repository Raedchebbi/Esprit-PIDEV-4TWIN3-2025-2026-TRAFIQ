# Production Migration and Scaling Upgrade

This upgrade keeps the existing APIs and WebSocket event names while adding MongoDB-primary storage, Redis-backed Socket.IO scaling, and centralized navigation sessions behind feature flags.

## Feature Flags

```bash
USE_MONGO_AS_PRIMARY=true
USE_REDIS=true
USE_CENTRAL_SESSIONS=true
```

If these flags are disabled or the backing service is unavailable, the backend keeps the current JSON/in-memory fallback behavior.

## Safe Activation Matrix

| Mode                                           | Expected behavior                                                                                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All flags disabled                             | Incidents, cameras, users, vehicle counts, WebSocket rooms, and navigation sessions use the legacy JSON/in-memory paths.                                                                                  |
| `USE_MONGO_AS_PRIMARY=true` only               | MongoDB is the primary source for incidents, cameras, users, and vehicle counts when `MONGODB_URI` is connected. Reads fall back to JSON if MongoDB is unavailable or a query fails.                      |
| `USE_REDIS=true` only                          | Socket.IO uses the Redis adapter when Redis connects. If Redis is unavailable, startup continues with the local Socket.IO adapter. Navigation sessions remain legacy unless central sessions are enabled. |
| `USE_CENTRAL_SESSIONS=true` only               | Navigation sessions use `CentralSessionService` with local memory fallback. Responses include `sessionToken`, but existing clients can continue using only `sessionId`.                                   |
| `USE_CENTRAL_SESSIONS=true` + `USE_REDIS=true` | Navigation sessions are shared through Redis. If Redis is unavailable, central sessions fall back to local memory.                                                                                        |
| Mongo enabled without Redis                    | Database reads/writes use MongoDB primary, while WebSocket scaling remains node-local.                                                                                                                    |
| Redis enabled without Mongo                    | Socket.IO scaling works across replicas, while runtime state remains JSON/in-memory unless central sessions are also enabled.                                                                             |

Fallback rule: feature flags enable upgraded paths only when their backing dependency is reachable. Runtime failures log warnings and degrade to legacy behavior where a legacy path exists.

## Migration Plan

1. Configure `MONGODB_URI` and `MONGODB_DB_NAME`.
2. Run `npm run migrate:json-to-mongo` from `backend/server`.
3. Verify MongoDB collections: `incidents`, `cameras`, `users`, `vehicle_counts`.
4. Start backend with `USE_MONGO_AS_PRIMARY=false` and compare API responses.
5. Enable `USE_MONGO_AS_PRIMARY=true` in staging.
6. Enable `USE_REDIS=true` and `USE_CENTRAL_SESSIONS=true` in staging with multiple backend replicas.
7. Promote flags to production after API, WebSocket, and navigation checks pass.

## MongoDB Schemas

### `incidents`

- `incident_id`: unique stable ID from AI/file source
- `incident_type`
- `timestamp`
- `snapshot`
- `vehicle_a`, `vehicle_b`, `iou`, `confidence`
- `camera_id`
- `risk_score`, `risk_level`, `risk_reason`
- `false_positive`
- `location`: optional GeoJSON Point
- `createdAt`, `updatedAt`, `migratedFrom`

Indexes:

- unique `{ incident_id: 1 }`
- `{ camera_id: 1, timestamp: -1 }`
- `{ false_positive: 1, timestamp: -1 }`
- `2dsphere` on `location`

### `cameras`

- `id`: unique camera ID
- `label`, `area`, `city`
- `location`
- `stream_url`, `media_url`, `media_type`, `enabled`
- `geo`: GeoJSON Point

Indexes:

- unique `{ id: 1 }`
- `{ area: 1 }`
- `2dsphere` on `geo`

### `users`

- `id`: existing user ID
- `email`, `emailLower`
- `name`, `password`, `role`, `country`, `createdBy`

Indexes:

- unique `{ id: 1 }`
- unique `{ emailLower: 1 }`

### `vehicle_counts`

- `snapshotId`: idempotent snapshot key
- `latest`: boolean latest marker
- `snapshot`: existing vehicle count payload
- `timestamp`

Indexes:

- unique `{ snapshotId: 1 }`
- `{ latest: 1, timestamp: -1 }`

## Updated Data Flow

```text
AI engine
  -> existing Socket.IO events unchanged
  -> RiskGateway
  -> MongoTelemetryService
  -> MongoPrimaryRepository upserts incidents when USE_MONGO_AS_PRIMARY=true
  -> existing admin/public broadcasts unchanged
```

```text
REST reads
  -> AccidentsService / CamerasService / AuthService / VehicleCountsStore
  -> MongoPrimaryRepository when USE_MONGO_AS_PRIMARY=true and MongoDB connected
  -> JSON files when MongoDB primary is disabled/unavailable
```

```text
Socket.IO scale-out
  -> RedisIoAdapter attaches @socket.io/redis-adapter when USE_REDIS=true
  -> broadcasts and rooms are shared across backend replicas
```

```text
Navigation sessions
  -> CentralSessionService when USE_CENTRAL_SESSIONS=true
  -> Redis when USE_REDIS=true
  -> in-process memory fallback when Redis disabled
  -> MongoDB user_sessions mirror remains best-effort analytics/persistence
```

## Redis Adapter Example

```ts
const pubClient = createClient({ url: `redis://${host}:${port}` });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
server.adapter(createAdapter(pubClient, subClient));
```

Implemented in `src/redis/redis-io.adapter.ts` and enabled from `main.ts`.

## Mongo Repository Example

```ts
await incidents.updateOne(
  { incident_id: incident.incident_id },
  {
    $set: { ...incident, updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date() },
  },
  { upsert: true },
);
```

Implemented in `src/mongodb/mongo-primary.repository.ts`.

## Session Lifecycle

1. `createSession()` creates `sessionId` and private `sessionToken`.
2. The token is returned in addition to the existing `sessionId` field.
3. Current frontend stores and sends `sessionToken` for subscribe/update/end operations.
4. When `USE_CENTRAL_SESSIONS=true`, missing or invalid tokens are rejected for updates, WebSocket subscriptions, and session end.
5. Session state is stored in Redis when enabled, otherwise in memory.
6. MongoDB `user_sessions` is updated as a persistent mirror for analytics and geo notifications.

## Session Service Example

```ts
const session = await centralSessionService.createSession(dto);
await centralSessionService.updatePosition(
  session.sessionId,
  positionDto,
  session.sessionToken,
);
await centralSessionService.endSession(session.sessionId, session.sessionToken);
```

## Backward Compatibility

- Existing REST route paths are unchanged.
- Existing Socket.IO event names are unchanged.
- JSON files are still used when MongoDB primary is disabled.
- Existing API paths and WebSocket event names are unchanged, but the frontend now sends `sessionToken` when central sessions are enabled.
- Existing AI engine can continue emitting the same events.
- Tokenless navigation remains supported only when `USE_CENTRAL_SESSIONS=false`.

## Remaining Production Hardening

- Authenticate AI engine Socket.IO producer.
- Move snapshots to shared object storage or PVC.
- Add Redis and MongoDB Kubernetes manifests/secrets.
- Add end-to-end migration verification tests.
