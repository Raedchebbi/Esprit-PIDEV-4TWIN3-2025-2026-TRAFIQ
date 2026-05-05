// ── TRAFIQ — Public WebSocket Gateway ─────────────────────────────────────────
// Handles real-time events for the citizen (public) app.
//
// Workflow:
//   1. Client connects and sends 'subscribe_route' with route coords
//   2. When the existing RiskGateway broadcasts 'new_incident', this gateway
//      checks if the incident is relevant to any subscribed route
//   3. Only sends 'navigation_alert' to clients with matching routes
//   4. Client sends 'update_position' to keep server aware of their location
//   5. Client sends 'unsubscribe_route' when navigation ends
//
// This gateway coexists with the existing RiskGateway on the same server
// using the '/public' namespace.

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { NavigationService } from './navigation.service';
import { GeoNotificationService } from '../mongodb/geo-notification.service';
import { WsRateLimiter } from '../rate-limit/ws-rate-limiter';

const gatewayCorsOrigin = process.env.CORS_ORIGIN || '*';

@WebSocketGateway({
  namespace: '/public',
  cors: {
    origin:
      gatewayCorsOrigin === '*'
        ? '*'
        : gatewayCorsOrigin.split(',').map((origin) => origin.trim()),
  },
})
export class PublicGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(PublicGateway.name);
  private readonly rateLimiter = new WsRateLimiter();

  // Map: socketId → sessionId
  private readonly subscriptions = new Map<string, string>();

  constructor(
    private readonly navigationService: NavigationService,
    private readonly geoNotificationService: GeoNotificationService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`[PublicGW] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[PublicGW] Client disconnected: ${client.id}`);
    this.subscriptions.delete(client.id);
  }

  /**
   * Client subscribes to route-specific alerts.
   * Payload: { sessionId: string }
   */
  @SubscribeMessage('subscribe_route')
  async handleSubscribeRoute(
    client: Socket,
    data: { sessionId: string; sessionToken?: string },
  ): Promise<void> {
    if (!data?.sessionId) return;
    if (!this.allowPublicEvent(client, 'subscribe_route')) return;
    const valid = await this.navigationService.validateSession(
      data.sessionId,
      data.sessionToken,
    );
    if (!valid) return;
    this.subscriptions.set(client.id, data.sessionId);
    void client.join(`route_${data.sessionId}`);
    this.logger.log(
      `[PublicGW] Client ${client.id} subscribed to session ${data.sessionId}`,
    );
  }

  /**
   * Client updates their position for geo-scoped filtering.
   * Payload: { sessionId: string, lat: number, lng: number, heading?: number, speed?: number }
   */
  @SubscribeMessage('update_position')
  handleUpdatePosition(
    client: Socket,
    data: {
      sessionId: string;
      lat: number;
      lng: number;
      heading?: number;
      speed?: number;
      sessionToken?: string;
    },
  ): void {
    if (!data?.sessionId) return;
    if (!this.allowPublicEvent(client, 'update_position')) return;
    void this.navigationService
      .updatePosition(
        data.sessionId,
        {
          lat: data.lat,
          lng: data.lng,
          heading: data.heading,
          speed: data.speed,
        },
        data.sessionToken,
      )
      .catch(() => undefined);
  }

  /**
   * Client unsubscribes from route alerts.
   * Payload: { sessionId: string }
   */
  @SubscribeMessage('unsubscribe_route')
  handleUnsubscribeRoute(client: Socket, data: { sessionId: string }): void {
    if (!data?.sessionId) return;
    void client.leave(`route_${data.sessionId}`);
    this.subscriptions.delete(client.id);
    this.logger.log(
      `[PublicGW] Client ${client.id} unsubscribed from session ${data.sessionId}`,
    );
  }

  /**
   * Called by the main RiskGateway (or internally when a new incident is detected).
   * Filters and pushes alerts only to subscribed clients whose routes are affected.
   */
  broadcastIncidentToRelevantSessions(
    incidentData: Record<string, unknown>,
  ): void {
    void this.broadcastMongoMatchedIncident(incidentData);

    const rawCameraId = incidentData.cam_id || incidentData.camera_id;
    const cameraId = typeof rawCameraId === 'string' ? rawCameraId : null;
    if (!cameraId) return;

    for (const [socketId, sessionId] of this.subscriptions) {
      void this.navigationService
        .isIncidentRelevant(cameraId, sessionId)
        .then((result) => {
          if (result.relevant) {
            this.server.to(socketId).emit('navigation_alert', {
              ...incidentData,
              scope: result.scope,
              distance: result.distance,
              sessionId,
            });
            this.logger.log(
              `[PublicGW] Alert sent to ${socketId} (${result.scope}-scoped, ${result.distance}m)`,
            );
          }
        })
        .catch(() => {
          this.subscriptions.delete(socketId);
        });
    }
  }

  private allowPublicEvent(client: Socket, eventName: string): boolean {
    const defaultLimit = eventName === 'update_position' ? 120 : 30;
    const envKey =
      eventName === 'update_position'
        ? 'RATE_LIMIT_PUBLIC_WS_POSITION_LIMIT'
        : 'RATE_LIMIT_PUBLIC_WS_SUBSCRIBE_LIMIT';
    const ttlKey =
      eventName === 'update_position'
        ? 'RATE_LIMIT_PUBLIC_WS_POSITION_TTL_MS'
        : 'RATE_LIMIT_PUBLIC_WS_SUBSCRIBE_TTL_MS';
    const allowed = this.rateLimiter.allow({
      key: eventName,
      clientId: client.id,
      limit: Number(process.env[envKey] ?? defaultLimit),
      ttlMs: Number(process.env[ttlKey] ?? 60_000),
    });
    if (!allowed) {
      this.logger.warn(
        `Rate limited public socket event ${eventName} from ${client.id}`,
      );
      client.emit('navigation_error', {
        event: eventName,
        reason: 'rate_limited',
      });
    }
    return allowed;
  }

  private async broadcastMongoMatchedIncident(
    incidentData: Record<string, unknown>,
  ): Promise<void> {
    const targets =
      await this.geoNotificationService.matchIncidentTargets(incidentData);

    for (const target of targets) {
      this.server
        .to(`route_${target.sessionId}`)
        .emit(target.event, target.payload);
      this.logger.log(
        `[PublicGW] Mongo alert emitted to session ${target.sessionId} (${target.matchType}, ${target.distanceMeters}m)`,
      );
    }
  }

  /**
   * Broadcast a congestion update to affected sessions.
   */
  broadcastCongestionUpdate(): void {
    for (const [socketId, sessionId] of this.subscriptions) {
      void this.navigationService
        .getCongestionAlertsForSession(sessionId)
        .then((congestionAlerts) => {
          if (congestionAlerts.length > 0) {
            this.server
              .to(socketId)
              .emit('route_congestion_update', congestionAlerts);
          }
        })
        .catch(() => {
          this.subscriptions.delete(socketId);
        });
    }
  }
}
