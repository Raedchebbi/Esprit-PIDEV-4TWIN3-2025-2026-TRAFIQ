import { Injectable, Logger } from '@nestjs/common';
import type { Document } from 'mongodb';
import { MongoTelemetryRepository } from './mongo-telemetry.repository';

export interface DangerousZone extends Document {
  cameraId?: string;
  incidentCount: number;
  averageRiskScore: number;
  latestIncident: Date;
}

export interface PeakAccidentTime extends Document {
  hour: number;
  incidentCount: number;
}

export interface BehaviorAnomaly extends Document {
  eventType: string;
  cameraId?: string;
  count: number;
  averageRiskScore: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly repository: MongoTelemetryRepository) {}

  async getMostDangerousZones(limit = 10): Promise<DangerousZone[]> {
    return this.safeAggregate('dangerous_zones', () =>
      this.repository.aggregateTrafficIncidents<DangerousZone>([
        { $match: { falsePositive: { $ne: true } } },
        {
          $group: {
            _id: '$cameraId',
            cameraId: { $first: '$cameraId' },
            incidentCount: { $sum: 1 },
            averageRiskScore: { $avg: '$riskScore' },
            latestIncident: { $max: '$timestamp' },
          },
        },
        { $sort: { incidentCount: -1, averageRiskScore: -1 } },
        { $limit: this.clampLimit(limit) },
      ]),
    );
  }

  async getPeakAccidentTimes(limit = 24): Promise<PeakAccidentTime[]> {
    return this.safeAggregate('peak_accident_times', () =>
      this.repository.aggregateTrafficIncidents<PeakAccidentTime>([
        { $match: { falsePositive: { $ne: true } } },
        {
          $group: {
            _id: { $hour: '$timestamp' },
            hour: { $first: { $hour: '$timestamp' } },
            incidentCount: { $sum: 1 },
          },
        },
        { $sort: { incidentCount: -1 } },
        { $limit: this.clampLimit(limit) },
      ]),
    );
  }

  async getBehaviorAnomalies(limit = 20): Promise<BehaviorAnomaly[]> {
    return this.safeAggregate('behavior_anomalies', () =>
      this.repository.aggregateAiEvents<BehaviorAnomaly>([
        {
          $match: {
            $or: [
              { riskScore: { $gte: 70 } },
              { riskLevel: { $in: ['HIGH', 'CRITICAL'] } },
            ],
          },
        },
        {
          $group: {
            _id: { eventType: '$eventType', cameraId: '$cameraId' },
            eventType: { $first: '$eventType' },
            cameraId: { $first: '$cameraId' },
            count: { $sum: 1 },
            averageRiskScore: { $avg: '$riskScore' },
          },
        },
        { $sort: { count: -1, averageRiskScore: -1 } },
        { $limit: this.clampLimit(limit) },
      ]),
    );
  }

  private async safeAggregate<T>(
    label: string,
    work: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Analytics aggregation skipped for ${label}: ${message}`,
      );
      return [];
    }
  }

  private clampLimit(limit: number): number {
    return Math.min(Math.max(limit, 1), 100);
  }
}
