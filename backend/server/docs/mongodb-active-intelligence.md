# MongoDB Active Intelligence Layer

MongoDB is now an active, optional intelligence layer. Existing file-backed incidents, current REST APIs, and WebSocket broadcasts remain unchanged. All MongoDB-powered behavior is additive and best-effort.

## Integration Plan

1. Persist live AI/WebSocket events into MongoDB through the existing `MongoTelemetryService`.
2. Compute historical risk context from `ai_events` and store it as metadata on new AI events.
3. Persist navigation sessions and GPS updates into `user_sessions`.
4. Match new traffic incidents against nearby active user sessions with MongoDB `2dsphere` queries.
5. Deliver local notifications through the existing `/public` WebSocket namespace and store delivery records in `notifications`.
6. Expose read-only admin analytics endpoints backed by MongoDB aggregation pipelines.

## New Services

- `HistoricalRiskService`: aggregates `ai_events` by camera, time, and event type to compute a historical risk boost.
- `GeoNotificationService`: matches incidents to active user sessions using geo radius and route overlap rules.
- `UserSessionService`: stores navigation session lifecycle and live position updates in `user_sessions`.
- `AnalyticsService`: provides dangerous zones, peak accident times, and behavior anomaly aggregations.

## Data Flow

```text
AI engine
  -> RiskGateway receives risk_event / incident_confirmed / vehicle_counts
  -> Existing frontend broadcasts continue unchanged
  -> MongoTelemetryService stores ai_events and traffic_incidents
  -> HistoricalRiskService adds historical context metadata
  -> GeoNotificationService checks active user_sessions near incidents
  -> PublicGateway emits navigation_alert to matching session rooms
  -> notifications collection stores delivery records
```

```text
Frontend navigation
  -> NavigationService starts in-memory session as before
  -> UserSessionService mirrors session in MongoDB
  -> Position updates continue updating in-memory session
  -> UserSessionService mirrors latest GeoJSON location in MongoDB
```

## Geo-Filtering Logic

Default radius: `GEO_NOTIFICATION_RADIUS_METERS=30`.

A notification target must satisfy all applicable constraints:

- The incident must resolve to a camera location.
- The user session must be active and recently updated within `USER_SESSION_ACTIVE_MINUTES`.
- The user session must be within 30 meters of the incident using a MongoDB `$near` query on `user_sessions.location`.
- If both incident country and session country are known, they must match.
- The incident must match by either direct geo proximity or route overlap.

Country isolation is enforced by storing camera `area` as the incident country and comparing it with `user_sessions.country` when available. This prevents a Tunisia user session from receiving France alerts when country context exists.

## Example Geo Query

```ts
db.user_sessions.find({
  endedAt: { $exists: false },
  country: 'Tunisia',
  lastSeenAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
  location: {
    $near: {
      $geometry: {
        type: 'Point',
        coordinates: [10.1815, 36.8065],
      },
      $maxDistance: 30,
    },
  },
});
```

## Example Historical Risk Aggregation

```ts
db.ai_events.aggregate([
  {
    $match: {
      cameraId: 'cam-1',
      timestamp: { $gte: ISODate('2026-04-21T00:00:00.000Z') },
    },
  },
  {
    $group: {
      _id: null,
      total: { $sum: 1 },
      repeatedIncidents: {
        $sum: { $cond: [{ $eq: ['$eventType', 'incident_confirmed'] }, 1, 0] },
      },
      highRiskEvents: {
        $sum: {
          $cond: [
            {
              $or: [
                { $gte: ['$riskScore', 70] },
                { $in: ['$riskLevel', ['HIGH', 'CRITICAL']] },
              ],
            },
            1,
            0,
          ],
        },
      },
      sameHourEvents: {
        $sum: { $cond: [{ $eq: [{ $hour: '$timestamp' }, 17] }, 1, 0] },
      },
      averageRiskScore: { $avg: '$riskScore' },
    },
  },
]);
```

## Example Analytics Queries

Most dangerous zones:

```ts
db.traffic_incidents.aggregate([
  { $match: { falsePositive: { $ne: true } } },
  {
    $group: {
      _id: '$cameraId',
      incidentCount: { $sum: 1 },
      averageRiskScore: { $avg: '$riskScore' },
      latestIncident: { $max: '$timestamp' },
    },
  },
  { $sort: { incidentCount: -1, averageRiskScore: -1 } },
  { $limit: 10 },
]);
```

Peak accident times:

```ts
db.traffic_incidents.aggregate([
  { $match: { falsePositive: { $ne: true } } },
  {
    $group: {
      _id: { $hour: '$timestamp' },
      incidentCount: { $sum: 1 },
    },
  },
  { $sort: { incidentCount: -1 } },
]);
```

## Optional Admin Endpoints

- `GET /mongo/risk-context?cameraId=cam-1`
- `GET /mongo/analytics/dangerous-zones?limit=10`
- `GET /mongo/analytics/peak-accident-times`
- `GET /mongo/analytics/behavior-anomalies?limit=20`

All endpoints use existing JWT and role guards.

## AI Prediction Improvement

The current AI decision path is not replaced. MongoDB provides a side input:

- Repeated incidents on the same camera increase `riskScoreBoost`.
- High historical risk scores increase `riskScoreBoost`.
- Events recurring in the same hour increase `riskScoreBoost`.
- The boost is capped at `30` and stored as event metadata for auditing.

This lets future AI/risk consumers use historical context without changing the live Python engine contract.

## User Experience Improvement

- Users receive fewer irrelevant alerts because notifications are local and route-aware.
- Active navigation sessions are understood by current position and planned route.
- Admins gain MongoDB-backed analytics for dangerous zones, peak hours, and recurring anomalies.
- If MongoDB is unavailable, existing real-time behavior continues normally.
