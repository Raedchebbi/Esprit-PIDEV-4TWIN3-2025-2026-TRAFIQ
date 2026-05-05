# MongoDB Integration

TRAFIQ keeps the existing file-backed data flow unchanged. MongoDB is added as an optional complementary storage layer for high-write telemetry, AI pipeline events, and analytics-style reads.

## Strategy

MongoDB complements the current architecture in these areas:

- AI engine outputs from WebSocket events are persisted for historical analysis.
- Confirmed traffic incidents are upserted into a queryable collection while the existing `incidents.jsonl` flow remains authoritative for current screens.
- Vehicle-count and camera-status telemetry is stored as append-only log data.
- Optional collections are available for notifications and user session tracking.

If `MONGODB_URI` is not set, the MongoDB module logs that it is disabled and all existing application behavior continues unchanged.

## Configuration

Add these variables to `backend/server/.env` when MongoDB should be enabled:

```bash
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=trafiq
MONGODB_MAX_POOL_SIZE=20
MONGODB_MIN_POOL_SIZE=0
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
MONGODB_TTL_DAYS=30
MONGODB_FAIL_FAST=false
```

Use a `mongodb+srv://` URI for MongoDB Atlas. Do not commit real credentials.

## Collections

### `ai_events`

Append-only AI event stream for risk events, confirmed incidents, camera status updates, and vehicle counts.

Important fields:

- `eventType`: `risk_event`, `incident_confirmed`, `camera_status`, or `vehicle_counts`
- `source`: currently `ai-engine`
- `timestamp`
- `cameraId`
- `riskScore`, `riskLevel`, `confidence`
- `rawPayload`: original event payload for flexible NoSQL ingestion

Indexes:

- `{ timestamp: -1 }`
- `{ cameraId: 1, timestamp: -1 }`
- `{ eventType: 1, timestamp: -1 }`
- TTL on `{ createdAt: 1 }` when `MONGODB_TTL_DAYS` is greater than `0`

### `traffic_incidents`

Queryable incident projection created from confirmed AI incidents.

Important fields:

- `incidentId`
- `incidentType`
- `timestamp`
- `cameraId`
- `snapshot`
- `vehicleA`, `vehicleB`, `iou`, `confidence`
- `riskScore`, `riskLevel`, `riskReason`
- `falsePositive`
- `location` as optional GeoJSON Point
- `rawPayload`

Indexes:

- unique sparse `{ incidentId: 1 }`
- `{ cameraId: 1, timestamp: -1 }`
- `{ falsePositive: 1, timestamp: -1 }`
- `2dsphere` on `location`

### `telemetry_logs`

High-write operational logs and telemetry from AI and real-time systems.

Important fields:

- `source`
- `level`
- `message`
- `timestamp`
- `cameraId`
- `payload`

Indexes:

- `{ source: 1, timestamp: -1 }`
- `{ level: 1, timestamp: -1 }`
- TTL on `{ createdAt: 1 }` when enabled

### `notifications`

Reserved collection for future notification delivery tracking.

Indexes:

- `{ recipientId: 1, status: 1, createdAt: -1 }`

### `user_sessions`

Reserved collection for future user or navigation session tracking.

Indexes:

- unique `{ sessionId: 1 }`
- sparse `{ userId: 1, lastSeenAt: -1 }`

## API Endpoints

All MongoDB read endpoints are additive and JWT-protected for `ADMIN` and `SUPER_ADMIN`.

- `GET /mongo/status`
- `GET /mongo/ai-events?eventType=risk_event&cameraId=cam-1&limit=100`
- `GET /mongo/incidents?cameraId=cam-1&activeOnly=true&limit=100`
- `GET /mongo/telemetry?source=ai-engine&level=info&limit=100`

These endpoints return empty arrays when MongoDB is disabled.

## Example Usage

The `RiskGateway` records MongoDB events as a best-effort side effect before continuing the existing broadcasts:

```ts
@SubscribeMessage('incident_confirmed')
handleIncidentConfirmed(client: Socket, data: unknown): void {
  this.mongoTelemetry.recordIncidentConfirmed(data);
  this.server.emit('new_incident', data);
  this.publicGateway.broadcastIncidentToRelevantSessions(data as Record<string, unknown>);
}
```

This preserves the current real-time path and adds historical persistence only when MongoDB is connected.
