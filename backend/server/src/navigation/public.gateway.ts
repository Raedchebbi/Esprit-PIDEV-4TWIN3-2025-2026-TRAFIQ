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

  // Map: socketId → sessionId
  private readonly subscriptions = new Map<string, string>();

  constructor(private readonly navigationService: NavigationService) {}

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
  handleSubscribeRoute(client: Socket, data: { sessionId: string }): void {
    if (!data?.sessionId) return;
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
    },
  ): void {
    if (!data?.sessionId) return;
    try {
      this.navigationService.updatePosition(data.sessionId, {
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        speed: data.speed,
      });
    } catch {
      // Session not found — client may have stale sessionId
    }
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
    const rawCameraId = incidentData.cam_id || incidentData.camera_id;
    const cameraId = typeof rawCameraId === 'string' ? rawCameraId : null;
    if (!cameraId) return;

    for (const [socketId, sessionId] of this.subscriptions) {
      const result = this.navigationService.isIncidentRelevant(
        cameraId,
        sessionId,
      );

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
    }
  }

  /**
   * Broadcast a congestion update to affected sessions.
   */
  broadcastCongestionUpdate(): void {
    for (const [socketId, sessionId] of this.subscriptions) {
      try {
        const congestionAlerts =
          this.navigationService.getCongestionAlertsForSession(sessionId);

        if (congestionAlerts.length > 0) {
          this.server
            .to(socketId)
            .emit('route_congestion_update', congestionAlerts);
        }
      } catch {
        this.subscriptions.delete(socketId);
      }
    }
  }
}
