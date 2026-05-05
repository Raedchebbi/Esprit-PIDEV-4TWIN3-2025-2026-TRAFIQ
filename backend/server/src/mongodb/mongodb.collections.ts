export const MONGODB_COLLECTIONS = {
  aiEvents: 'ai_events',
  trafficIncidents: 'traffic_incidents',
  telemetryLogs: 'telemetry_logs',
  notifications: 'notifications',
  userSessions: 'user_sessions',
  incidents: 'incidents',
  cameras: 'cameras',
  users: 'users',
  vehicleCounts: 'vehicle_counts',
} as const;

export type MongoCollectionName =
  (typeof MONGODB_COLLECTIONS)[keyof typeof MONGODB_COLLECTIONS];
