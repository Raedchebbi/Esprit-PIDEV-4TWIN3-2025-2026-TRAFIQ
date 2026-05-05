import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Document } from 'mongodb';
import { CamerasService } from '../cameras/cameras.service';
import { MongoTelemetryRepository } from './mongo-telemetry.repository';

export interface HistoricalRiskContext {
  cameraId?: string;
  country?: string;
  sampleSize: number;
  repeatedIncidentCount: number;
  highRiskEventCount: number;
  sameHourEventCount: number;
  averageRiskScore: number;
  riskScoreBoost: number;
  reasons: string[];
}

interface HistoricalRiskAggregation extends Document {
  total: number;
  repeatedIncidents: number;
  highRiskEvents: number;
  sameHourEvents: number;
  averageRiskScore?: number;
}

@Injectable()
export class HistoricalRiskService {
  private readonly logger = new Logger(HistoricalRiskService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly repository: MongoTelemetryRepository,
  ) {}

  getCountryForCamera(cameraId?: string): string | undefined {
    if (!cameraId) return undefined;
    return this.camerasService
      .findAll()
      .find((camera) => camera.id === cameraId)?.area;
  }

  async getRiskBoostForEvent(payload: Record<string, unknown>) {
    const cameraId = this.readString(
      payload,
      'camera_id',
      'cam_id',
      'cameraId',
    );
    return this.getRiskBoost({
      cameraId,
      timestamp: this.readTimestamp(payload),
    });
  }

  async getRiskBoost(input: {
    cameraId?: string;
    timestamp?: Date;
  }): Promise<HistoricalRiskContext> {
    const empty = this.emptyContext(input.cameraId);
    if (!input.cameraId) return empty;

    try {
      const lookbackDays = this.readNumber('HISTORICAL_RISK_LOOKBACK_DAYS', 14);
      const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
      const hour = (input.timestamp ?? new Date()).getHours();

      const [summary] =
        await this.repository.aggregateAiEvents<HistoricalRiskAggregation>([
          {
            $match: {
              cameraId: input.cameraId,
              timestamp: { $gte: since },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              repeatedIncidents: {
                $sum: {
                  $cond: [{ $eq: ['$eventType', 'incident_confirmed'] }, 1, 0],
                },
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
                $sum: {
                  $cond: [{ $eq: [{ $hour: '$timestamp' }, hour] }, 1, 0],
                },
              },
              averageRiskScore: { $avg: '$riskScore' },
            },
          },
        ]);

      if (!summary) return empty;

      const reasons: string[] = [];
      let boost = 0;
      boost += Math.min(summary.repeatedIncidents * 2, 12);
      boost += Math.min(summary.highRiskEvents * 1.5, 10);
      boost += Math.min(summary.sameHourEvents, 8);

      if (summary.repeatedIncidents > 0) reasons.push('repeated incidents');
      if (summary.highRiskEvents > 0)
        reasons.push('historical high-risk events');
      if (summary.sameHourEvents > 0) reasons.push('same-hour risk pattern');

      return {
        cameraId: input.cameraId,
        country: this.getCountryForCamera(input.cameraId),
        sampleSize: summary.total,
        repeatedIncidentCount: summary.repeatedIncidents,
        highRiskEventCount: summary.highRiskEvents,
        sameHourEventCount: summary.sameHourEvents,
        averageRiskScore: Math.round(summary.averageRiskScore ?? 0),
        riskScoreBoost: Math.min(Math.round(boost), 30),
        reasons,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Historical risk lookup skipped: ${message}`);
      return empty;
    }
  }

  private emptyContext(cameraId?: string): HistoricalRiskContext {
    return {
      cameraId,
      country: this.getCountryForCamera(cameraId),
      sampleSize: 0,
      repeatedIncidentCount: 0,
      highRiskEventCount: 0,
      sameHourEventCount: 0,
      averageRiskScore: 0,
      riskScoreBoost: 0,
      reasons: [],
    };
  }

  private readString(
    payload: Record<string, unknown>,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
  }

  private readTimestamp(payload: Record<string, unknown>): Date {
    const value = payload.timestamp ?? payload.ts ?? payload.created_at;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return new Date();
  }

  private readNumber(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
