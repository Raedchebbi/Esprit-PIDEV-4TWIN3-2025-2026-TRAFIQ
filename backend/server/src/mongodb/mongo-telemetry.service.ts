import { Injectable, Logger } from '@nestjs/common';
import type { ObjectId } from 'mongodb';
import {
  AiEventDocument,
  JsonRecord,
  TelemetryLogDocument,
  TrafficIncidentDocument,
} from './mongodb.documents';
import {
  AiEventQuery,
  MongoTelemetryRepository,
  TelemetryLogQuery,
  TrafficIncidentQuery,
} from './mongo-telemetry.repository';
import { HistoricalRiskService } from './historical-risk.service';
import { MongoPrimaryRepository } from './mongo-primary.repository';

type PublicMongoDocument<T> = Omit<T, '_id' | 'createdAt' | 'updatedAt'> & {
  _id?: string;
  createdAt?: string;
  updatedAt?: string;
};

@Injectable()
export class MongoTelemetryService {
  private readonly logger = new Logger(MongoTelemetryService.name);

  constructor(
    private readonly repository: MongoTelemetryRepository,
    private readonly historicalRiskService: HistoricalRiskService,
    private readonly mongoPrimary: MongoPrimaryRepository,
  ) {}

  recordRiskEvent(data: unknown): void {
    const payload = this.asRecord(data);
    void this.safePersist('risk_event', async () => {
      const historicalRisk =
        await this.historicalRiskService.getRiskBoostForEvent(payload);
      await this.repository.insertAiEvent({
        eventType: 'risk_event',
        source: 'ai-engine',
        timestamp: this.readTimestamp(payload),
        cameraId: this.readString(payload, 'camera_id', 'cam_id', 'cameraId'),
        riskScore: this.readNumber(payload, 'risk_score', 'riskScore'),
        riskLevel: this.readString(payload, 'risk_level', 'riskLevel'),
        confidence: this.readNumber(payload, 'confidence'),
        rawPayload: payload,
        metadata: { historicalRisk },
      });
    });
  }

  recordIncidentConfirmed(data: unknown): void {
    const payload = this.asRecord(data);
    void this.safePersist('incident_confirmed', async () => {
      const timestamp = this.readTimestamp(payload);
      const cameraId = this.readString(
        payload,
        'camera_id',
        'cam_id',
        'cameraId',
      );
      const historicalRisk = await this.historicalRiskService.getRiskBoost({
        cameraId,
        timestamp,
      });

      await Promise.all([
        this.repository.insertAiEvent({
          eventType: 'incident_confirmed',
          source: 'ai-engine',
          timestamp,
          cameraId,
          riskScore: this.readNumber(payload, 'risk_score', 'riskScore'),
          riskLevel: this.readString(payload, 'risk_level', 'riskLevel'),
          confidence: this.readNumber(payload, 'confidence'),
          rawPayload: payload,
          metadata: { historicalRisk },
        }),
        this.repository.upsertTrafficIncident({
          incidentId: this.readString(
            payload,
            'incident_id',
            'incidentId',
            'id',
          ),
          incidentType: this.readString(
            payload,
            'incident_type',
            'incidentType',
            'type',
          ),
          timestamp,
          cameraId,
          snapshot: this.readString(payload, 'snapshot', 'snapshot_url'),
          vehicleA: this.readNumber(payload, 'vehicle_a', 'vehicleA'),
          vehicleB: this.readNumber(payload, 'vehicle_b', 'vehicleB'),
          iou: this.readNumber(payload, 'iou'),
          confidence: this.readNumber(payload, 'confidence'),
          riskScore: this.readNumber(payload, 'risk_score', 'riskScore'),
          riskLevel: this.readString(payload, 'risk_level', 'riskLevel'),
          riskReason: this.readString(payload, 'risk_reason', 'reasoning'),
          falsePositive: this.readBoolean(
            payload,
            'false_positive',
            'falsePositive',
          ),
          rawPayload: payload,
        }),
        this.upsertPrimaryIncident(payload, timestamp, cameraId),
      ]);
    });
  }

  private async upsertPrimaryIncident(
    payload: JsonRecord,
    timestamp: Date,
    cameraId?: string,
  ): Promise<void> {
    if (!this.mongoPrimary.isPrimaryEnabled()) return;
    const incidentId = this.readString(
      payload,
      'incident_id',
      'incidentId',
      'id',
    );
    if (!incidentId) return;
    await this.mongoPrimary.upsertIncident({
      incident_id: incidentId,
      incident_type:
        this.readString(payload, 'incident_type', 'incidentType', 'type') ??
        'vehicle_collision',
      timestamp: timestamp.toISOString(),
      snapshot: this.readString(payload, 'snapshot', 'snapshot_url') ?? '',
      vehicle_a: this.readNumber(payload, 'vehicle_a', 'vehicleA') ?? -1,
      vehicle_b: this.readNumber(payload, 'vehicle_b', 'vehicleB') ?? -1,
      iou: this.readNumber(payload, 'iou') ?? 0,
      confidence: this.readNumber(payload, 'confidence') ?? 0,
      camera_id: cameraId ?? '',
      risk_score: this.readNumber(payload, 'risk_score', 'riskScore'),
      risk_level: this.readString(payload, 'risk_level', 'riskLevel'),
      risk_reason: this.readString(payload, 'risk_reason', 'reasoning'),
      false_positive: this.readBoolean(
        payload,
        'false_positive',
        'falsePositive',
      ),
    });
  }

  recordCameraStatus(data: unknown): void {
    const payload = this.asRecord(data);
    void this.safePersist('camera_status', async () => {
      const cameraId = this.readString(
        payload,
        'camera_id',
        'cam_id',
        'cameraId',
      );
      await Promise.all([
        this.repository.insertAiEvent({
          eventType: 'camera_status',
          source: 'ai-engine',
          timestamp: this.readTimestamp(payload),
          cameraId,
          rawPayload: payload,
        }),
        this.repository.insertTelemetryLog({
          source: 'ai-engine',
          level: 'info',
          message: `Camera status update${cameraId ? ` for ${cameraId}` : ''}`,
          timestamp: this.readTimestamp(payload),
          cameraId,
          payload,
        }),
      ]);
    });
  }

  recordVehicleCounts(data: unknown): void {
    const payload = this.asRecord(data);
    void this.safePersist('vehicle_counts', async () => {
      await Promise.all([
        this.repository.insertAiEvent({
          eventType: 'vehicle_counts',
          source: 'ai-engine',
          timestamp: this.readTimestamp(payload),
          rawPayload: payload,
        }),
        this.repository.insertTelemetryLog({
          source: 'ai-engine',
          level: 'info',
          message: 'Vehicle counts updated',
          timestamp: this.readTimestamp(payload),
          payload,
        }),
      ]);
    });
  }

  async findAiEvents(
    query: AiEventQuery,
  ): Promise<PublicMongoDocument<AiEventDocument>[]> {
    const documents = await this.repository.findAiEvents(query);
    return documents.map((document) => this.toPublicDocument(document));
  }

  async findTrafficIncidents(
    query: TrafficIncidentQuery,
  ): Promise<PublicMongoDocument<TrafficIncidentDocument>[]> {
    const documents = await this.repository.findTrafficIncidents(query);
    return documents.map((document) => this.toPublicDocument(document));
  }

  async findTelemetryLogs(
    query: TelemetryLogQuery,
  ): Promise<PublicMongoDocument<TelemetryLogDocument>[]> {
    const documents = await this.repository.findTelemetryLogs(query);
    return documents.map((document) => this.toPublicDocument(document));
  }

  private async safePersist(
    label: string,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MongoDB persistence skipped for ${label}: ${message}`);
    }
  }

  private asRecord(data: unknown): JsonRecord {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as JsonRecord;
    }
    return { value: data };
  }

  private readString(
    payload: JsonRecord,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return undefined;
  }

  private readNumber(
    payload: JsonRecord,
    ...keys: string[]
  ): number | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return undefined;
  }

  private readBoolean(
    payload: JsonRecord,
    ...keys: string[]
  ): boolean | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
      }
    }
    return undefined;
  }

  private readTimestamp(payload: JsonRecord): Date {
    const value = payload.timestamp ?? payload.ts ?? payload.created_at;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return new Date();
  }

  private toPublicDocument<T extends { _id?: ObjectId }>(
    document: T,
  ): PublicMongoDocument<T> {
    const publicDocument = { ...document } as PublicMongoDocument<T>;
    publicDocument._id = document._id?.toHexString();
    this.formatDate(publicDocument, 'createdAt');
    this.formatDate(publicDocument, 'updatedAt');
    this.formatDate(publicDocument, 'timestamp');
    this.formatDate(publicDocument, 'startedAt');
    this.formatDate(publicDocument, 'endedAt');
    this.formatDate(publicDocument, 'lastSeenAt');
    return publicDocument;
  }

  private formatDate(document: Record<string, unknown>, key: string): void {
    const value = document[key];
    if (value instanceof Date) {
      document[key] = value.toISOString();
    }
  }
}
