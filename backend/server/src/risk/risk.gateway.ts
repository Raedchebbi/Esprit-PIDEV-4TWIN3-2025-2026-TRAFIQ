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

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VehicleCountsStore } from './vehicle-counts.store';

@WebSocketGateway({ cors: { origin: '*' } })
export class RiskGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly vehicleCounts: VehicleCountsStore) {}

  handleConnection(client: Socket) {
    console.log(`[RiskGateway] Client connected:    ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[RiskGateway] Client disconnected: ${client.id}`);
  }

  /**
   * Python AI engine sends 'risk_event' every N frames with the Groq
   * (or heuristic fallback) risk assessment result.
   * We re-broadcast as 'risk_update' to all React frontend clients.
   */
  @SubscribeMessage('risk_event')
  handleRiskEvent(client: Socket, data: unknown): void {
    this.server.emit('risk_update', data);
  }

  /**
   * Python AI engine sends 'incident_confirmed' when a collision passes
   * the CONFIRMATION_FRAMES streak threshold.
   * We re-broadcast as 'new_incident' to all React frontend clients.
   */
  @SubscribeMessage('incident_confirmed')
  handleIncidentConfirmed(client: Socket, data: unknown): void {
    this.server.emit('new_incident', data);
  }

  /**
   * Python AI engine sends 'camera_status' when a camera comes online
   * or goes offline (RTSP reconnect events).
   * We re-broadcast as 'camera_update' to all React frontend clients.
   */
  @SubscribeMessage('camera_status')
  handleCameraStatus(client: Socket, data: unknown): void {
    this.server.emit('camera_update', data);
  }

  /**
   * Python AI engine sends 'vehicle_counts' every N frames with
   * per-camera live vehicle counts.
   * We store the latest snapshot and re-broadcast to frontend clients.
   */
  @SubscribeMessage('vehicle_counts')
  handleVehicleCounts(client: Socket, data: any): void {
    this.vehicleCounts.update(data);
    this.server.emit('vehicle_counts', data);
  }
}
