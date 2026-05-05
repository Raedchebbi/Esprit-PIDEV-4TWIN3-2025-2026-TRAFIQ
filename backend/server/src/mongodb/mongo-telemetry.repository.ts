import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Document, Filter } from 'mongodb';
import { MONGODB_COLLECTIONS } from './mongodb.collections';
import {
  AiEventDocument,
  AiEventInput,
  NotificationDocument,
  NotificationInput,
  TelemetryLogDocument,
  TelemetryLogInput,
  TrafficIncidentDocument,
  TrafficIncidentInput,
  UserSessionTrackingDocument,
  UserSessionTrackingInput,
} from './mongodb.documents';
import { MongoDbService } from './mongodb.service';

export interface AiEventQuery {
  eventType?: string;
  cameraId?: string;
  limit?: number;
}

export interface TrafficIncidentQuery {
  cameraId?: string;
  activeOnly?: boolean;
  limit?: number;
}

export interface TelemetryLogQuery {
  source?: string;
  level?: string;
  limit?: number;
}

export interface NearbyUserSessionQuery {
  lng: number;
  lat: number;
  radiusMeters: number;
  since?: Date;
  country?: string;
}

@Injectable()
export class MongoTelemetryRepository implements OnApplicationBootstrap {
  private readonly logger = new Logger(MongoTelemetryRepository.name);

  constructor(private readonly mongoDb: MongoDbService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureIndexes();
  }

  async ensureIndexes(): Promise<void> {
    if (!this.mongoDb.isConnected()) {
      return;
    }

    const ttlSeconds = this.mongoDb.readTtlSeconds();

    try {
      const aiEvents = this.mongoDb.collection<AiEventDocument>(
        MONGODB_COLLECTIONS.aiEvents,
      );
      const trafficIncidents = this.mongoDb.collection<TrafficIncidentDocument>(
        MONGODB_COLLECTIONS.trafficIncidents,
      );
      const telemetryLogs = this.mongoDb.collection<TelemetryLogDocument>(
        MONGODB_COLLECTIONS.telemetryLogs,
      );
      const notifications = this.mongoDb.collection<NotificationDocument>(
        MONGODB_COLLECTIONS.notifications,
      );
      const userSessions = this.mongoDb.collection<UserSessionTrackingDocument>(
        MONGODB_COLLECTIONS.userSessions,
      );

      await Promise.all([
        aiEvents?.createIndex({ timestamp: -1 }, { name: 'ts_desc' }),
        aiEvents?.createIndex(
          { cameraId: 1, timestamp: -1 },
          { name: 'camera_ts_desc' },
        ),
        aiEvents?.createIndex(
          { eventType: 1, timestamp: -1 },
          { name: 'event_type_ts_desc' },
        ),
        ttlSeconds
          ? aiEvents?.createIndex(
              { createdAt: 1 },
              { expireAfterSeconds: ttlSeconds, name: 'ttl_created_at' },
            )
          : undefined,
        trafficIncidents?.createIndex(
          { incidentId: 1 },
          { unique: true, sparse: true, name: 'uniq_incident_id' },
        ),
        trafficIncidents?.createIndex(
          { cameraId: 1, timestamp: -1 },
          { name: 'incident_camera_ts_desc' },
        ),
        trafficIncidents?.createIndex(
          { falsePositive: 1, timestamp: -1 },
          { name: 'false_positive_ts_desc' },
        ),
        trafficIncidents?.createIndex(
          { location: '2dsphere' },
          { name: 'incident_location_2dsphere' },
        ),
        telemetryLogs?.createIndex(
          { source: 1, timestamp: -1 },
          { name: 'source_ts_desc' },
        ),
        telemetryLogs?.createIndex(
          { level: 1, timestamp: -1 },
          { name: 'level_ts_desc' },
        ),
        ttlSeconds
          ? telemetryLogs?.createIndex(
              { createdAt: 1 },
              { expireAfterSeconds: ttlSeconds, name: 'ttl_created_at' },
            )
          : undefined,
        notifications?.createIndex(
          { recipientId: 1, status: 1, createdAt: -1 },
          { name: 'recipient_status_created_desc' },
        ),
        notifications?.createIndex(
          { incidentId: 1, sessionId: 1 },
          { name: 'incident_session' },
        ),
        userSessions?.createIndex(
          { sessionId: 1 },
          { unique: true, name: 'uniq_session_id' },
        ),
        userSessions?.createIndex(
          { userId: 1, lastSeenAt: -1 },
          { sparse: true, name: 'user_last_seen_desc' },
        ),
        userSessions?.createIndex(
          { location: '2dsphere' },
          { name: 'session_location_2dsphere' },
        ),
        userSessions?.createIndex(
          { country: 1, lastSeenAt: -1 },
          { sparse: true, name: 'country_last_seen_desc' },
        ),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create MongoDB indexes: ${message}`);
    }
  }

  async insertAiEvent(input: AiEventInput): Promise<string | null> {
    const collection = this.mongoDb.collection<AiEventDocument>(
      MONGODB_COLLECTIONS.aiEvents,
    );
    if (!collection) return null;

    const now = new Date();
    const result = await collection.insertOne({
      ...input,
      timestamp: this.toDate(input.timestamp),
      createdAt: now,
      updatedAt: now,
    });
    return result.insertedId.toHexString();
  }

  async upsertTrafficIncident(
    input: TrafficIncidentInput,
  ): Promise<string | null> {
    const collection = this.mongoDb.collection<TrafficIncidentDocument>(
      MONGODB_COLLECTIONS.trafficIncidents,
    );
    if (!collection) return null;

    const now = new Date();
    const document: Omit<TrafficIncidentDocument, '_id' | 'createdAt'> = {
      ...input,
      timestamp: this.toDate(input.timestamp),
      updatedAt: now,
    };

    if (!input.incidentId) {
      const result = await collection.insertOne({
        ...document,
        createdAt: now,
      });
      return result.insertedId.toHexString();
    }

    await collection.updateOne(
      { incidentId: input.incidentId },
      {
        $set: document,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return input.incidentId;
  }

  async insertTelemetryLog(input: TelemetryLogInput): Promise<string | null> {
    const collection = this.mongoDb.collection<TelemetryLogDocument>(
      MONGODB_COLLECTIONS.telemetryLogs,
    );
    if (!collection) return null;

    const now = new Date();
    const result = await collection.insertOne({
      ...input,
      timestamp: this.toDate(input.timestamp),
      createdAt: now,
      updatedAt: now,
    });
    return result.insertedId.toHexString();
  }

  async insertNotification(input: NotificationInput): Promise<string | null> {
    const collection = this.mongoDb.collection<NotificationDocument>(
      MONGODB_COLLECTIONS.notifications,
    );
    if (!collection) return null;

    const now = new Date();
    const result = await collection.insertOne({
      ...input,
      timestamp: this.toDate(input.timestamp),
      createdAt: now,
      updatedAt: now,
    });
    return result.insertedId.toHexString();
  }

  async upsertNotification(input: NotificationInput): Promise<string | null> {
    const collection = this.mongoDb.collection<NotificationDocument>(
      MONGODB_COLLECTIONS.notifications,
    );
    if (!collection) return null;

    const now = new Date();
    if (!input.incidentId || !input.sessionId) {
      return this.insertNotification(input);
    }

    await collection.updateOne(
      { incidentId: input.incidentId, sessionId: input.sessionId },
      {
        $set: {
          ...input,
          timestamp: this.toDate(input.timestamp),
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return `${input.incidentId}:${input.sessionId}`;
  }

  async upsertUserSession(
    input: UserSessionTrackingInput,
  ): Promise<string | null> {
    const collection = this.mongoDb.collection<UserSessionTrackingDocument>(
      MONGODB_COLLECTIONS.userSessions,
    );
    if (!collection) return null;

    const now = new Date();
    await collection.updateOne(
      { sessionId: input.sessionId },
      {
        $set: {
          ...input,
          startedAt: this.toDate(input.startedAt),
          endedAt: input.endedAt ? this.toDate(input.endedAt) : undefined,
          lastSeenAt: this.toDate(input.lastSeenAt),
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
    return input.sessionId;
  }

  async findAiEvents(query: AiEventQuery): Promise<AiEventDocument[]> {
    const collection = this.mongoDb.collection<AiEventDocument>(
      MONGODB_COLLECTIONS.aiEvents,
    );
    if (!collection) return [];

    const filter: Filter<AiEventDocument> = {};
    if (query.eventType) filter.eventType = query.eventType;
    if (query.cameraId) filter.cameraId = query.cameraId;

    return collection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(this.clampLimit(query.limit))
      .toArray();
  }

  async findTrafficIncidents(
    query: TrafficIncidentQuery,
  ): Promise<TrafficIncidentDocument[]> {
    const collection = this.mongoDb.collection<TrafficIncidentDocument>(
      MONGODB_COLLECTIONS.trafficIncidents,
    );
    if (!collection) return [];

    const filter: Filter<TrafficIncidentDocument> = {};
    if (query.cameraId) filter.cameraId = query.cameraId;
    if (query.activeOnly) filter.falsePositive = { $ne: true };

    return collection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(this.clampLimit(query.limit))
      .toArray();
  }

  async findTelemetryLogs(
    query: TelemetryLogQuery,
  ): Promise<TelemetryLogDocument[]> {
    const collection = this.mongoDb.collection<TelemetryLogDocument>(
      MONGODB_COLLECTIONS.telemetryLogs,
    );
    if (!collection) return [];

    const filter: Filter<TelemetryLogDocument> = {};
    if (query.source) filter.source = query.source;
    if (query.level) filter.level = query.level;

    return collection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(this.clampLimit(query.limit))
      .toArray();
  }

  async findNearbyUserSessions(
    query: NearbyUserSessionQuery,
  ): Promise<UserSessionTrackingDocument[]> {
    const collection = this.mongoDb.collection<UserSessionTrackingDocument>(
      MONGODB_COLLECTIONS.userSessions,
    );
    if (!collection) return [];

    const filter: Filter<UserSessionTrackingDocument> = {
      endedAt: { $exists: false },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [query.lng, query.lat],
          },
          $maxDistance: query.radiusMeters,
        },
      },
    };
    if (query.since) filter.lastSeenAt = { $gte: query.since };
    if (query.country) filter.country = query.country;

    return collection.find(filter).limit(500).toArray();
  }

  async aggregateAiEvents<T extends Document>(
    pipeline: Document[],
  ): Promise<T[]> {
    const collection = this.mongoDb.collection<AiEventDocument>(
      MONGODB_COLLECTIONS.aiEvents,
    );
    if (!collection) return [];
    return collection.aggregate<T>(pipeline).toArray();
  }

  async aggregateTrafficIncidents<T extends Document>(
    pipeline: Document[],
  ): Promise<T[]> {
    const collection = this.mongoDb.collection<TrafficIncidentDocument>(
      MONGODB_COLLECTIONS.trafficIncidents,
    );
    if (!collection) return [];
    return collection.aggregate<T>(pipeline).toArray();
  }

  private toDate(value: Date): Date {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  private clampLimit(limit = 100): number {
    return Math.min(Math.max(limit, 1), 500);
  }
}
