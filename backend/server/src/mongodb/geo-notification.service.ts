import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CamerasService } from '../cameras/cameras.service';
import { MongoTelemetryRepository } from './mongo-telemetry.repository';
import type {
  TrafficIncidentDocument,
  UserSessionTrackingDocument,
} from './mongodb.documents';

export interface GeoNotificationTarget {
  sessionId: string;
  userId?: string;
  distanceMeters: number;
  matchType: 'geo' | 'route';
  event: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class GeoNotificationService {
  private readonly logger = new Logger(GeoNotificationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly camerasService: CamerasService,
    private readonly repository: MongoTelemetryRepository,
  ) {}

  async matchIncidentTargets(
    incidentData: Record<string, unknown>,
  ): Promise<GeoNotificationTarget[]> {
    try {
      const incident = this.normalizeIncident(incidentData);
      if (!incident.location) return [];

      const [lng, lat] = incident.location.coordinates;
      const radiusMeters = this.readNumber(
        'GEO_NOTIFICATION_RADIUS_METERS',
        30,
      );
      const activeMinutes = this.readNumber('USER_SESSION_ACTIVE_MINUTES', 10);
      const country = this.getIncidentCountry(incident.cameraId);
      const sessions = await this.repository.findNearbyUserSessions({
        lng,
        lat,
        radiusMeters,
        country,
        since: new Date(Date.now() - activeMinutes * 60 * 1000),
      });

      const targets: GeoNotificationTarget[] = [];
      for (const session of sessions) {
        if (country && session.country && session.country !== country) continue;

        const distanceMeters = this.distanceMeters(
          lat,
          lng,
          session.location?.coordinates[1],
          session.location?.coordinates[0],
        );
        const routeMatch = this.isIncidentOnRoute(
          incident,
          session,
          radiusMeters,
        );
        const geoMatch = distanceMeters <= radiusMeters;

        if (!routeMatch && !geoMatch) continue;

        const matchType = routeMatch ? 'route' : 'geo';
        const notification = {
          incidentId: incident.incidentId,
          sessionId: session.sessionId,
          recipientId: session.userId,
          type: 'traffic_incident',
          status: 'sent',
          title: this.titleForIncident(incident),
          message: this.messageForIncident(
            incident,
            Math.round(distanceMeters),
          ),
          timestamp: new Date(),
          distanceMeters: Math.round(distanceMeters),
          matchType,
          payload: {
            incident,
            sessionId: session.sessionId,
            country,
          },
        };

        await this.repository.upsertNotification(notification);
        targets.push({
          sessionId: session.sessionId,
          userId: session.userId,
          distanceMeters: Math.round(distanceMeters),
          matchType,
          event: 'navigation_alert',
          payload: {
            ...incidentData,
            sessionId: session.sessionId,
            scope: matchType,
            distance: Math.round(distanceMeters),
            notification,
          },
        });
      }

      return targets;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Geo notification matching skipped: ${message}`);
      return [];
    }
  }

  private normalizeIncident(
    data: Record<string, unknown>,
  ): TrafficIncidentDocument {
    const cameraId = this.readString(data, 'camera_id', 'cam_id', 'cameraId');
    const camera = cameraId
      ? this.camerasService.findAll().find((entry) => entry.id === cameraId)
      : undefined;

    return {
      incidentId: this.readString(data, 'incident_id', 'incidentId', 'id'),
      incidentType: this.readString(
        data,
        'incident_type',
        'incidentType',
        'type',
      ),
      timestamp: this.readTimestamp(data),
      cameraId,
      riskLevel: this.readString(data, 'risk_level', 'riskLevel'),
      riskScore: this.readNumber(data, 'risk_score', 'riskScore'),
      location: camera?.location
        ? {
            type: 'Point',
            coordinates: [camera.location.longitude, camera.location.latitude],
          }
        : undefined,
      createdAt: new Date(),
    };
  }

  private getIncidentCountry(cameraId?: string): string | undefined {
    if (!cameraId) return undefined;
    return this.camerasService
      .findAll()
      .find((camera) => camera.id === cameraId)?.area;
  }

  private isIncidentOnRoute(
    incident: TrafficIncidentDocument,
    session: UserSessionTrackingDocument,
    radiusMeters: number,
  ): boolean {
    const route = session.activeRoute?.routeCoords;
    if (!route || route.length < 2 || !incident.location) return false;
    const [lng, lat] = incident.location.coordinates;
    for (let i = 0; i < route.length - 1; i++) {
      const distance = this.pointToSegmentDistance(
        lat,
        lng,
        route[i][0],
        route[i][1],
        route[i + 1][0],
        route[i + 1][1],
      );
      if (distance <= radiusMeters) return true;
    }
    return false;
  }

  private titleForIncident(incident: TrafficIncidentDocument): string {
    if (incident.riskLevel === 'CRITICAL')
      return 'Critical traffic incident nearby';
    if (incident.riskLevel === 'HIGH')
      return 'High-risk traffic incident nearby';
    return 'Traffic incident nearby';
  }

  private messageForIncident(
    incident: TrafficIncidentDocument,
    distanceMeters: number,
  ): string {
    const type = incident.incidentType ?? 'incident';
    return `${type} detected ${distanceMeters}m from your current route or location.`;
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

  private readNumber(
    payload: Record<string, unknown>,
    ...keys: string[]
  ): number | undefined;
  private readNumber(key: string, fallback: number): number;
  private readNumber(
    first: Record<string, unknown> | string,
    ...rest: (string | number)[]
  ): number | undefined {
    if (typeof first === 'string') {
      const parsed = Number(this.configService.get<string>(first));
      return Number.isFinite(parsed) ? parsed : (rest[0] as number);
    }

    for (const key of rest as string[]) {
      const value = first[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
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

  private distanceMeters(
    lat1?: number,
    lng1?: number,
    lat2?: number,
    lng2?: number,
  ): number {
    if (
      !Number.isFinite(lat1) ||
      !Number.isFinite(lng1) ||
      !Number.isFinite(lat2) ||
      !Number.isFinite(lng2)
    ) {
      return Infinity;
    }
    const radius = 6371000;
    const dLat = (((lat2 as number) - (lat1 as number)) * Math.PI) / 180;
    const dLng = (((lng2 as number) - (lng1 as number)) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(((lat1 as number) * Math.PI) / 180) *
        Math.cos(((lat2 as number) * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private pointToSegmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return this.distanceMeters(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return this.distanceMeters(px, py, ax + t * dx, ay + t * dy);
  }
}
