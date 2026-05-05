import { Injectable, Logger } from '@nestjs/common';
import { MongoTelemetryRepository } from './mongo-telemetry.repository';
import type { RouteContext } from './mongodb.documents';

export interface PersistUserSessionInput {
  sessionId: string;
  userId?: string;
  lat?: number;
  lng?: number;
  country?: string;
  route?: RouteContext;
  clientType?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class UserSessionService {
  private readonly logger = new Logger(UserSessionService.name);

  constructor(private readonly repository: MongoTelemetryRepository) {}

  trackSessionStarted(input: PersistUserSessionInput): void {
    void this.safePersist('session_started', async () => {
      const now = new Date();
      await this.repository.upsertUserSession({
        sessionId: input.sessionId,
        userId: input.userId,
        startedAt: now,
        lastSeenAt: now,
        clientType: input.clientType ?? 'public-navigation',
        location: this.toGeoPoint(input.lng, input.lat),
        country: input.country,
        activeRoute: input.route,
        metadata: input.metadata,
      });
    });
  }

  trackPositionUpdated(input: PersistUserSessionInput): void {
    void this.safePersist('position_updated', async () => {
      const now = new Date();
      await this.repository.upsertUserSession({
        sessionId: input.sessionId,
        userId: input.userId,
        startedAt: now,
        lastSeenAt: now,
        clientType: input.clientType ?? 'public-navigation',
        location: this.toGeoPoint(input.lng, input.lat),
        country: input.country,
        activeRoute: input.route,
        metadata: input.metadata,
      });
    });
  }

  trackSessionEnded(sessionId: string): void {
    void this.safePersist('session_ended', async () => {
      const now = new Date();
      await this.repository.upsertUserSession({
        sessionId,
        startedAt: now,
        endedAt: now,
        lastSeenAt: now,
      });
    });
  }

  private toGeoPoint(lng?: number, lat?: number) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
    return {
      type: 'Point' as const,
      coordinates: [lng!, lat!] as [number, number],
    };
  }

  private async safePersist(
    label: string,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `MongoDB user session write skipped for ${label}: ${message}`,
      );
    }
  }
}
