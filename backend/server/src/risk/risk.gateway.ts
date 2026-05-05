// =============================================================
// TRAFIQ — Risk WebSocket Gateway
// =============================================================
//
// Message flow:
//
//   Python AI engine (python-socketio client)
//       │
//       │  emit('risk_event',        { risk_score, risk_level, reasoning, ... })
//       │  emit('incident_confirmed',{ cam_id, snapshot, vehicle_a/b, iou, ... })
//       │  emit('camera_status',     { cam_id, status: 'online'|'offline'|... })
//       │
//       ▼
//   @WebSocketGateway (this file — Socket.io server)
//       │
//       │  broadcast('risk_update',    ...)  → all React frontend clients
//       │  broadcast('new_incident',   ...)  → all React frontend clients
//       │  broadcast('camera_update',  ...)  → all React frontend clients
//       ▼
//   React admin dashboard (socket.io-client)
//
// Python connects here as a regular socket.io client and emits events.
// NestJS re-broadcasts those events to all connected browser clients.
// =============================================================

import { Inject, Logger, forwardRef } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PublicGateway } from '../navigation/public.gateway';
import { VehicleCountsStore } from './vehicle-counts.store';
import type { VehicleCountsSnapshot } from './vehicle-counts.store';
import { MongoTelemetryService } from '../mongodb/mongo-telemetry.service';
import { AiEventValidation } from './ai-event-validation';
import { WsRateLimiter } from '../rate-limit/ws-rate-limiter';

const gatewayCorsOrigin = process.env.CORS_ORIGIN || '*';
const gatewayNamespace = process.env.WS_NAMESPACE || '/';

@WebSocketGateway({
  namespace: gatewayNamespace,
  cors: {
    origin:
      gatewayCorsOrigin === '*'
        ? '*'
        : gatewayCorsOrigin.split(',').map((origin) => origin.trim()),
  },
})
export class RiskGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RiskGateway.name);
  private readonly validator = new AiEventValidation();
  private readonly rateLimiter = new WsRateLimiter();

  constructor(
    private readonly vehicleCounts: VehicleCountsStore,
    private readonly mongoTelemetry: MongoTelemetryService,
    @Inject(forwardRef(() => PublicGateway))
    private readonly publicGateway: PublicGateway,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`[RiskGateway] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[RiskGateway] Client disconnected: ${client.id}`);
  }

  /**
   * Python AI engine sends 'risk_event' every N frames with the Groq
   * (or heuristic fallback) risk assessment result.
   * We re-broadcast as 'risk_update' to all React frontend clients.
   */
  @SubscribeMessage('risk_event')
  handleRiskEvent(client: Socket, data: unknown): void {
    if (!this.requireAiProducer(client, 'risk_event')) return;
    if (!this.allowProducerEvent(client, 'risk_event')) return;
    const result = this.validator.validateRiskEvent(data);
    if (!result.valid)
      return this.rejectMalformed(client, 'risk_event', result.reason);
    this.mongoTelemetry.recordRiskEvent(result.data);
    this.server.emit('risk_update', result.data);
  }

  /**
   * Python AI engine sends 'incident_confirmed' when a collision passes
   * the CONFIRMATION_FRAMES streak threshold.
   * We re-broadcast as 'new_incident' to all React frontend clients.
   */
  @SubscribeMessage('incident_confirmed')
  handleIncidentConfirmed(client: Socket, data: unknown): void {
    if (!this.requireAiProducer(client, 'incident_confirmed')) return;
    if (!this.allowProducerEvent(client, 'incident_confirmed')) return;
    const result = this.validator.validateIncidentConfirmed(data);
    if (!result.valid)
      return this.rejectMalformed(client, 'incident_confirmed', result.reason);
    this.mongoTelemetry.recordIncidentConfirmed(result.data);
    this.server.emit('new_incident', result.data);
    if (result.data && typeof result.data === 'object') {
      this.publicGateway.broadcastIncidentToRelevantSessions(
        result.data as Record<string, unknown>,
      );
    }
  }

  /**
   * Python AI engine sends 'camera_status' when a camera comes online
   * or goes offline (RTSP reconnect events).
   * We re-broadcast as 'camera_update' to all React frontend clients.
   */
  @SubscribeMessage('camera_status')
  handleCameraStatus(client: Socket, data: unknown): void {
    if (!this.requireAiProducer(client, 'camera_status')) return;
    if (!this.allowProducerEvent(client, 'camera_status')) return;
    const result = this.validator.validateCameraStatus(data);
    if (!result.valid)
      return this.rejectMalformed(client, 'camera_status', result.reason);
    this.mongoTelemetry.recordCameraStatus(result.data);
    this.server.emit('camera_update', result.data);
  }

  /**
   * Python AI engine sends 'vehicle_counts' every N frames with
   * per-camera live vehicle counts.
   * We store the latest snapshot and re-broadcast to frontend clients.
   */
  @SubscribeMessage('vehicle_counts')
  handleVehicleCounts(client: Socket, data: VehicleCountsSnapshot): void {
    if (!this.requireAiProducer(client, 'vehicle_counts')) return;
    if (!this.allowProducerEvent(client, 'vehicle_counts')) return;
    const result = this.validator.validateVehicleCounts(data);
    if (!result.valid)
      return this.rejectMalformed(client, 'vehicle_counts', result.reason);
    this.mongoTelemetry.recordVehicleCounts(result.data);
    this.vehicleCounts.update(result.data);
    this.server.emit('vehicle_counts', result.data);
    this.publicGateway.broadcastCongestionUpdate();
  }

  private requireAiProducer(client: Socket, eventName: string): boolean {
    const expectedToken = process.env.AI_WS_TOKEN;
    if (!expectedToken) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn(
          `Rejected AI producer event ${eventName} from ${client.id}: AI_WS_TOKEN is not configured`,
        );
        client.emit('producer_error', {
          event: eventName,
          reason: 'unauthorized',
        });
        return false;
      }
      this.logger.warn(
        `AI_WS_TOKEN is not configured; accepting ${eventName} only because NODE_ENV is not production`,
      );
      return true;
    }

    const providedToken = this.extractToken(client);
    if (providedToken !== expectedToken) {
      this.logger.warn(
        `Rejected unauthorized AI producer event ${eventName} from ${client.id}`,
      );
      client.emit('producer_error', {
        event: eventName,
        reason: 'unauthorized',
      });
      return false;
    }
    return true;
  }

  private extractToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    const authToken = auth?.token;
    if (typeof authToken === 'string') return authToken;
    const headerToken = client.handshake.headers['x-ai-ws-token'];
    if (typeof headerToken === 'string') return headerToken;
    return undefined;
  }

  private allowProducerEvent(client: Socket, eventName: string): boolean {
    const limit = Number(process.env.RATE_LIMIT_AI_WS_LIMIT ?? 600);
    const ttlMs = Number(process.env.RATE_LIMIT_AI_WS_TTL_MS ?? 60_000);
    const allowed = this.rateLimiter.allow({
      key: eventName,
      clientId: client.id,
      limit,
      ttlMs,
    });
    if (!allowed) {
      this.logger.warn(
        `Rate limited AI producer event ${eventName} from ${client.id}`,
      );
      client.emit('producer_error', {
        event: eventName,
        reason: 'rate_limited',
      });
    }
    return allowed;
  }

  private rejectMalformed(
    client: Socket,
    eventName: string,
    reason: string,
  ): void {
    this.logger.warn(
      `Rejected malformed AI producer event ${eventName} from ${client.id}: ${reason}`,
    );
    client.emit('producer_error', {
      event: eventName,
      reason: 'malformed_payload',
    });
  }
}
