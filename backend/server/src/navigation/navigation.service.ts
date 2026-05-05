// ── TRAFIQ — Navigation Service ──────────────────────────────────────────────
// In-memory navigation session management with route-scoped alert filtering.
// Sessions auto-expire after 2 hours of inactivity.

import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { AccidentsService } from '../accidents/accidents.service';
import { Accident } from '../accidents/accident.schema';
import { CamerasService, CameraEntry } from '../cameras/cameras.service';
import { VehicleCountsStore } from '../risk/vehicle-counts.store';
import { UserSessionService } from '../mongodb/user-session.service';
import { CentralSessionService } from './central-session.service';
import {
  NavigationSession,
  NavigationAlert,
  StartNavigationDto,
  UpdatePositionDto,
} from './navigation-session.interface';

@Injectable()
export class NavigationService implements OnModuleDestroy {
  private readonly logger = new Logger(NavigationService.name);
  private readonly sessions = new Map<string, NavigationSession>();
  private readonly SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly accidentsService: AccidentsService,
    private readonly camerasService: CamerasService,
    private readonly vehicleCounts: VehicleCountsStore,
    private readonly userSessionService: UserSessionService,
    private readonly centralSessionService: CentralSessionService,
  ) {
    // Periodic cleanup of expired sessions
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 60_000);
  }

  // ── Session Lifecycle ─────────────────────────────────────────────────────

  /**
   * Start a new navigation session.
   * Returns a unique sessionId for the client to use.
   */
  async startSession(
    dto: StartNavigationDto,
  ): Promise<{ sessionId: string; sessionToken?: string }> {
    if (this.centralSessionService.useCentralStore()) {
      return this.centralSessionService.createSession(dto);
    }

    const sessionId = this.generateSessionId();
    const session: NavigationSession = {
      sessionId,
      routeId: dto.routeId,
      routeCoords: dto.routeCoords,
      origin: dto.origin,
      destination: dto.destination,
      currentPosition: { lat: dto.origin.lat, lng: dto.origin.lng },
      createdAt: new Date(),
      lastUpdate: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.userSessionService.trackSessionStarted({
      sessionId,
      lat: dto.origin.lat,
      lng: dto.origin.lng,
      route: {
        routeId: dto.routeId,
        routeCoords: dto.routeCoords,
        origin: dto.origin,
        destination: dto.destination,
      },
    });
    this.logger.log(
      `Navigation session started: ${sessionId} (route: ${dto.routeId})`,
    );
    return { sessionId };
  }

  /**
   * Update the user's current position within a session.
   */
  async updatePosition(
    sessionId: string,
    dto: UpdatePositionDto,
    sessionToken?: string,
  ): Promise<void> {
    if (this.centralSessionService.useCentralStore()) {
      await this.centralSessionService.updatePosition(
        sessionId,
        dto,
        sessionToken,
      );
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    session.currentPosition = {
      lat: dto.lat,
      lng: dto.lng,
      heading: dto.heading,
      speed: dto.speed,
      accuracy: dto.accuracy,
    };
    session.lastUpdate = new Date();
    this.userSessionService.trackPositionUpdated({
      sessionId,
      lat: dto.lat,
      lng: dto.lng,
      route: {
        routeId: session.routeId,
        routeCoords: session.routeCoords,
        origin: session.origin,
        destination: session.destination,
      },
      metadata: {
        heading: dto.heading,
        speed: dto.speed,
        accuracy: dto.accuracy,
      },
    });
  }

  /**
   * End a navigation session and clean up.
   */
  async endSession(sessionId: string, sessionToken?: string): Promise<void> {
    if (this.centralSessionService.useCentralStore()) {
      await this.centralSessionService.endSession(sessionId, sessionToken);
      return;
    }

    if (this.sessions.delete(sessionId)) {
      this.userSessionService.trackSessionEnded(sessionId);
      this.logger.log(`Navigation session ended: ${sessionId}`);
    }
  }

  /**
   * Get a session by ID.
   */
  async getSession(sessionId: string): Promise<NavigationSession | undefined> {
    if (this.centralSessionService.useCentralStore()) {
      return this.centralSessionService.getSession(sessionId);
    }
    return this.sessions.get(sessionId);
  }

  async validateSession(sessionId: string, token?: string): Promise<boolean> {
    if (this.centralSessionService.useCentralStore()) {
      return this.centralSessionService.validateSession(sessionId, token);
    }
    return this.sessions.has(sessionId);
  }

  /**
   * Get all active sessions (for gateway use).
   */
  getAllSessions(): Map<string, NavigationSession> {
    return this.sessions;
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  // ── Scoped Alerts ─────────────────────────────────────────────────────────

  /**
   * Get alerts scoped to a specific navigation session.
   * Returns only alerts that are:
   *   1. Within 500m of the route polyline (route-scoped), OR
   *   2. Within 1000m of the user's current position (geo-scoped)
   */
  async getAlerts(sessionId: string): Promise<NavigationAlert[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const incidents = await this.accidentsService.findActive();
    const cameras = this.camerasService.findAll();
    const cameraMap = new Map<string, CameraEntry>();
    for (const cam of cameras) {
      cameraMap.set(cam.id, cam);
    }

    const alerts: NavigationAlert[] = [];

    for (const inc of incidents) {
      const cam = cameraMap.get(inc.camera_id);
      if (!cam?.location) continue;

      const incLat = cam.location.latitude;
      const incLng = cam.location.longitude;

      // Check route-scoped (within 500m of route polyline)
      const isRouteScoped = this.isPointNearPolyline(
        incLat,
        incLng,
        session.routeCoords,
        500,
      );

      // Check geo-scoped (within 1000m of user position)
      const distToUser = this.haversine(
        incLat,
        incLng,
        session.currentPosition.lat,
        session.currentPosition.lng,
      );
      const isGeoScoped = distToUser <= 1000;

      if (!isRouteScoped && !isGeoScoped) continue;

      // Determine severity from risk level
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
      if (inc.risk_level === 'CRITICAL') severity = 'critical';
      else if (inc.risk_level === 'HIGH') severity = 'high';
      else if (inc.risk_level === 'LOW') severity = 'low';

      // Determine alert type
      let type: 'accident' | 'congestion' | 'risk' | 'blocked' = 'accident';
      if (inc.incident_type === 'vehicle_collision') type = 'accident';

      alerts.push({
        id: inc.incident_id,
        type,
        severity,
        title: this.getAlertTitle(type, severity),
        message: this.getAlertMessage(inc, Math.round(distToUser)),
        distance: Math.round(distToUser),
        lat: incLat,
        lng: incLng,
        cameraId: inc.camera_id,
        timestamp: inc.timestamp,
        scope: isRouteScoped ? 'route' : 'geo',
      });
    }

    // Add congestion alerts for zones on the route
    const congestionAlerts = await this.getCongestionAlerts(session);
    alerts.push(...congestionAlerts);

    return alerts.sort((a, b) => a.distance - b.distance);
  }

  async getCongestionAlertsForSession(
    sessionId: string,
  ): Promise<NavigationAlert[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const alerts = await this.getCongestionAlerts(session);
    return alerts.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Check if an incident (by camera location) is relevant to a session.
   * Used by the gateway for real-time filtering.
   */
  async isIncidentRelevant(
    incidentCameraId: string,
    sessionId: string,
  ): Promise<{
    relevant: boolean;
    scope: 'route' | 'geo' | null;
    distance: number;
  }> {
    const session = await this.getSession(sessionId);
    if (!session) return { relevant: false, scope: null, distance: Infinity };

    const cameras = this.camerasService.findAll();
    const cam = cameras.find((c) => c.id === incidentCameraId);
    if (!cam?.location)
      return { relevant: false, scope: null, distance: Infinity };

    const incLat = cam.location.latitude;
    const incLng = cam.location.longitude;

    const isRouteScoped = this.isPointNearPolyline(
      incLat,
      incLng,
      session.routeCoords,
      500,
    );

    const distToUser = this.haversine(
      incLat,
      incLng,
      session.currentPosition.lat,
      session.currentPosition.lng,
    );
    const isGeoScoped = distToUser <= 1000;

    if (isRouteScoped)
      return { relevant: true, scope: 'route', distance: distToUser };
    if (isGeoScoped)
      return { relevant: true, scope: 'geo', distance: distToUser };
    return { relevant: false, scope: null, distance: distToUser };
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async getCongestionAlerts(
    session: NavigationSession,
  ): Promise<NavigationAlert[]> {
    const counts = await this.vehicleCounts.getLatestAsync();
    const cameras = this.camerasService.findAll();
    const cameraMap = new Map<string, CameraEntry>();
    for (const cam of cameras) {
      cameraMap.set(cam.id, cam);
    }

    const alerts: NavigationAlert[] = [];

    for (const pc of counts.per_camera || []) {
      if (pc.count < 20) continue; // Only alert on dense/saturated zones

      const cam = cameraMap.get(pc.cam_id);
      if (!cam?.location) continue;

      const isNearRoute = this.isPointNearPolyline(
        cam.location.latitude,
        cam.location.longitude,
        session.routeCoords,
        1000,
      );

      if (!isNearRoute) continue;

      const distToUser = this.haversine(
        cam.location.latitude,
        cam.location.longitude,
        session.currentPosition.lat,
        session.currentPosition.lng,
      );

      const level = pc.count > 30 ? 'Saturé' : 'Dense';
      alerts.push({
        id: `congestion_${pc.cam_id}`,
        type: 'congestion',
        severity: pc.count > 30 ? 'high' : 'medium',
        title: `Trafic ${level}`,
        message: `Zone ${cam.area} — ${pc.count} véhicules détectés. Ralentissement probable.`,
        distance: Math.round(distToUser),
        lat: cam.location.latitude,
        lng: cam.location.longitude,
        cameraId: pc.cam_id,
        timestamp: counts.timestamp,
        scope: 'route',
      });
    }

    return alerts;
  }

  private getAlertTitle(type: string, severity: string): string {
    const titles: Record<string, string> = {
      accident:
        severity === 'critical'
          ? '🚨 ACCIDENT CRITIQUE SUR VOTRE ROUTE'
          : '⚠️ Accident détecté à proximité',
      congestion: 'Congestion détectée',
      risk: 'Zone à risque',
      blocked: '🚫 Route bloquée',
    };
    return titles[type] || 'Alerte TRAFIQ';
  }

  private getAlertMessage(inc: Accident, distance: number): string {
    const riskInfo = inc.risk_level
      ? ` Niveau de risque: ${inc.risk_level}.`
      : '';
    return `Incident détecté à ${distance}m de votre position.${riskInfo} ${inc.risk_reason || 'Soyez vigilant.'}`;
  }

  private haversine(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private isPointNearPolyline(
    lat: number,
    lng: number,
    polyline: [number, number][],
    radiusMeters: number,
  ): boolean {
    for (let i = 0; i < polyline.length - 1; i++) {
      const dist = this.pointToSegmentDistance(
        lat,
        lng,
        polyline[i][0],
        polyline[i][1],
        polyline[i + 1][0],
        polyline[i + 1][1],
      );
      if (dist <= radiusMeters) return true;
    }
    for (const [plat, plng] of polyline) {
      if (this.haversine(lat, lng, plat, plng) <= radiusMeters) return true;
    }
    return false;
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
    if (dx === 0 && dy === 0) return this.haversine(px, py, ax, ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return this.haversine(px, py, ax + t * dx, ay + t * dy);
  }

  private generateSessionId(): string {
    return `nav_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastUpdate.getTime() > this.SESSION_TTL_MS) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired navigation session(s)`);
    }
  }
}
