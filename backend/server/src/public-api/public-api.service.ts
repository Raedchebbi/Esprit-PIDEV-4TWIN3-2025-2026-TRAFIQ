// ── TRAFIQ — Public API Service ───────────────────────────────────────────────
// Business logic for public (unauthenticated) endpoints.
// READS from existing AccidentsService, CamerasService, VehicleCountsStore
// without modifying any of them.

import { Injectable, Logger } from '@nestjs/common';
import { AccidentsService } from '../accidents/accidents.service';
import { CamerasService, CameraEntry } from '../cameras/cameras.service';
import { VehicleCountsStore } from '../risk/vehicle-counts.store';
import {
  PublicIncident,
  CongestionZone,
  SuggestedRoute,
  SuggestRoutesDto,
} from '../navigation/navigation-session.interface';

@Injectable()
export class PublicApiService {
  private readonly logger = new Logger(PublicApiService.name);

  constructor(
    private readonly accidentsService: AccidentsService,
    private readonly camerasService: CamerasService,
    private readonly vehicleCounts: VehicleCountsStore,
  ) {}

  // ── Public Incidents (enriched with GPS) ──────────────────────────────────

  /**
   * Returns active incidents enriched with camera GPS coordinates.
   * Maps camera_id → camera location so the frontend can plot incidents on map.
   */
  async getPublicIncidents(): Promise<PublicIncident[]> {
    const incidents = await this.accidentsService.findActive();
    const cameras = this.camerasService.findAll();
    const cameraMap = new Map<string, CameraEntry>();
    for (const cam of cameras) {
      cameraMap.set(cam.id, cam);
    }

    return incidents.map((inc) => {
      const cam = cameraMap.get(inc.camera_id);
      return {
        incident_id: inc.incident_id,
        incident_type: inc.incident_type,
        timestamp: inc.timestamp,
        camera_id: inc.camera_id,
        risk_score: inc.risk_score,
        risk_level: inc.risk_level,
        risk_reason: inc.risk_reason,
        confidence: inc.confidence,
        lat: cam?.location?.latitude ?? 0,
        lng: cam?.location?.longitude ?? 0,
        area: cam?.area ?? 'Unknown',
        city: cam?.city,
      };
    });
  }

  // ── Congestion Data ───────────────────────────────────────────────────────

  /**
   * Returns per-zone congestion data by merging vehicle counts with camera info.
   */
  async getCongestionData(): Promise<CongestionZone[]> {
    const counts = await this.vehicleCounts.getLatestAsync();
    const cameras = this.camerasService.findAll();
    const cameraMap = new Map<string, CameraEntry>();
    for (const cam of cameras) {
      cameraMap.set(cam.id, cam);
    }

    return (counts.per_camera || []).map((pc) => {
      const cam = cameraMap.get(pc.cam_id);
      return {
        camera_id: pc.cam_id,
        label: cam?.label ?? pc.cam_id,
        area: cam?.area ?? 'Unknown',
        lat: cam?.location?.latitude ?? 0,
        lng: cam?.location?.longitude ?? 0,
        vehicleCount: pc.count,
        congestionLevel: this.computeCongestionLevel(pc.count),
      };
    });
  }

  private computeCongestionLevel(
    count: number,
  ): 'Fluide' | 'Modéré' | 'Dense' | 'Saturé' {
    if (count <= 5) return 'Fluide';
    if (count <= 15) return 'Modéré';
    if (count <= 30) return 'Dense';
    return 'Saturé';
  }

  // ── Route Suggestions ─────────────────────────────────────────────────────

  /**
   * Generate AI-scored route suggestions based on active incidents and congestion.
   *
   * Uses predefined route templates (matching the existing ROAD_POLYLINES and
   * ROUTES_DATA from the frontend) and scores them based on:
   *   - Active incident count on/near route (weight: 0.5)
   *   - Average congestion along route (weight: 0.3)
   *   - Total distance (weight: 0.2)
   */
  async suggestRoutes(dto: SuggestRoutesDto): Promise<SuggestedRoute[]> {
    const incidents = await this.getPublicIncidents();
    const congestion = await this.getCongestionData();

    // Predefined route templates — mirrors frontend mock data structure.
    // In production, this would query a routing engine (OSRM, Mapbox, etc.)
    const routeTemplates = this.getRouteTemplates(dto);

    return routeTemplates
      .map((route, idx) => {
        // Count incidents within 500m of route polyline
        const nearbyIncidents = incidents.filter((inc) =>
          this.isPointNearPolyline(inc.lat, inc.lng, route.coords, 500),
        );

        // Average congestion of zones near route
        const nearbyCongestion = congestion.filter((cz) =>
          this.isPointNearPolyline(cz.lat, cz.lng, route.coords, 2000),
        );
        const avgCongestion =
          nearbyCongestion.length > 0
            ? nearbyCongestion.reduce((sum, cz) => sum + cz.vehicleCount, 0) /
              nearbyCongestion.length
            : 0;

        // Compute risk score (0–1, lower is better)
        const incidentPenalty = Math.min(nearbyIncidents.length * 0.3, 1.0);
        const congestionPenalty = Math.min(avgCongestion / 40, 1.0);
        const distancePenalty = Math.min(route.dist / 20, 1.0);

        const riskScore =
          incidentPenalty * 0.5 +
          congestionPenalty * 0.3 +
          distancePenalty * 0.2;

        // Classify route
        let label: string;
        let labelColor: string;
        let labelBg: string;
        let status: 'free' | 'slow' | 'blocked';
        let aiLabel: SuggestedRoute['aiLabel'];
        let aiReasoning: string;

        if (riskScore < 0.3) {
          label = 'RECOMMANDÉ PAR IA';
          labelColor = '#2E7D32';
          labelBg = '#E8F5E9';
          status = 'free';
          aiLabel = 'RECOMMENDED';
          aiReasoning =
            'Aucun incident détecté, trafic fluide. Itinéraire optimal.';
        } else if (riskScore < 0.6) {
          label = `ALTERNATIF +${Math.round(riskScore * 10)} min`;
          labelColor = '#F57C00';
          labelBg = '#FFF3E0';
          status = 'slow';
          aiLabel = 'ALTERNATIVE';
          aiReasoning = `${nearbyIncidents.length} incident(s) à proximité, congestion ${this.computeCongestionLevel(avgCongestion).toLowerCase()}.`;
        } else {
          label = 'DÉCONSEILLÉ PAR IA';
          labelColor = '#B71C1C';
          labelBg = '#FFEBEE';
          status = 'blocked';
          aiLabel = 'NOT_RECOMMENDED';
          aiReasoning = `Zone à risque élevé: ${nearbyIncidents.length} incident(s), congestion ${this.computeCongestionLevel(avgCongestion).toLowerCase()}.`;
        }

        const congestionLevel = this.computeCongestionLevel(avgCongestion);

        return {
          id: idx + 1,
          label,
          aiLabel,
          labelColor,
          labelBg,
          roads: route.roads,
          time: route.time + Math.round(riskScore * 15),
          dist: route.dist,
          status,
          incidents: nearbyIncidents.length,
          riskScore: Math.round(riskScore * 100) / 100,
          congestionLevel,
          coords: route.coords,
          color:
            riskScore < 0.3
              ? '#1A73E8'
              : riskScore < 0.6
                ? '#F57C00'
                : '#E53935',
          weight: idx === 0 ? 5 : 3,
          opacity: idx === 0 ? 0.9 : 0.6,
          dashArray: idx === 0 ? null : '8,4',
          aiReasoning,
        };
      })
      .sort((a, b) => a.riskScore - b.riskScore);
  }

  // ── Geo Helpers ───────────────────────────────────────────────────────────

  /**
   * Haversine distance between two points in meters.
   */
  haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

  /**
   * Check if a point is within `radiusMeters` of any segment in a polyline.
   */
  isPointNearPolyline(
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
    // Also check individual waypoints
    for (const [plat, plng] of polyline) {
      if (this.haversine(lat, lng, plat, plng) <= radiusMeters) return true;
    }
    return false;
  }

  /**
   * Perpendicular distance from a point to a line segment (in meters).
   * Uses projection clamped to segment endpoints.
   */
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
    if (dx === 0 && dy === 0) {
      return this.haversine(px, py, ax, ay);
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    const nearestLat = ax + t * dx;
    const nearestLng = ay + t * dy;
    return this.haversine(px, py, nearestLat, nearestLng);
  }

  /**
   * Route templates — predefined paths used for suggestion.
   * Mirrors the existing ITINERAIRES_MOCK and ROAD_POLYLINES from the frontend.
   */
  private getRouteTemplates(dto: SuggestRoutesDto) {
    return [
      {
        roads: ['A1', 'Blvd Mohamed V'],
        time: 18,
        dist: 7.2,
        coords: [
          [dto.originLat, dto.originLng],
          [36.808, 10.18],
          [36.806, 10.183],
          [dto.destLat, dto.destLng],
        ] as [number, number][],
      },
      {
        roads: ['Avenue Habib Bourguiba', 'Rue de Marseille'],
        time: 22,
        dist: 8.8,
        coords: [
          [dto.originLat, dto.originLng],
          [36.809, 10.177],
          [36.808, 10.18],
          [36.807, 10.183],
          [dto.destLat, dto.destLng],
        ] as [number, number][],
      },
      {
        roads: ['Rue de la Liberté', 'Avenue de la Foire'],
        time: 30,
        dist: 6.1,
        coords: [
          [dto.originLat, dto.originLng],
          [36.811, 10.178],
          [36.809, 10.182],
          [36.807, 10.186],
          [dto.destLat, dto.destLng],
        ] as [number, number][],
      },
    ];
  }
}
