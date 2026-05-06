// ── TRAFIQ — Navigation Session Interfaces ───────────────────────────────────
// TypeScript interfaces for navigation session state management.
// Used by NavigationService and PublicGateway.

import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface UserPosition extends GeoPoint {
  heading?: number;
  speed?: number;
  accuracy?: number;
}

export interface NavigationSession {
  sessionId: string;
  routeId: string;
  routeCoords: [number, number][];
  origin: GeoPoint;
  destination: GeoPoint;
  currentPosition: UserPosition;
  createdAt: Date;
  lastUpdate: Date;
}

export interface NavigationAlert {
  id: string;
  type: 'accident' | 'congestion' | 'risk' | 'blocked';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  distance: number; // meters from route origin for route scope, user for geo scope
  lat: number;
  lng: number;
  cameraId?: string;
  timestamp: string;
  scope: 'route' | 'geo'; // how this alert matched
}

export class GeoPointDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

export class StartNavigationDto {
  @IsString()
  routeId: string;

  @IsArray()
  @ArrayMinSize(2)
  routeCoords: [number, number][];

  @ValidateNested()
  @Type(() => GeoPointDto)
  origin: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  destination: GeoPointDto;
}

export class UpdatePositionDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;
}

export class SuggestRoutesDto {
  @IsNumber()
  originLat: number;

  @IsNumber()
  originLng: number;

  @IsNumber()
  destLat: number;

  @IsNumber()
  destLng: number;
}

export interface PublicIncident {
  incident_id: string;
  incident_type: string;
  timestamp: string;
  camera_id: string;
  risk_score?: number;
  risk_level?: string;
  risk_reason?: string;
  confidence: number;
  lat: number;
  lng: number;
  area: string;
  city?: string;
}

export interface CongestionZone {
  camera_id: string;
  label: string;
  area: string;
  lat: number;
  lng: number;
  vehicleCount: number;
  congestionLevel: 'Fluide' | 'Modéré' | 'Dense' | 'Saturé';
}

export interface SuggestedRoute {
  id: number;
  label: string;
  aiLabel?: 'RECOMMENDED' | 'ALTERNATIVE' | 'NOT_RECOMMENDED';
  labelColor: string;
  labelBg: string;
  roads: string[];
  time: number;
  dist: number;
  status: 'free' | 'slow' | 'blocked';
  incidents: number;
  activeIncidents: PublicIncident[];
  riskScore: number;
  congestionLevel: string;
  coords: [number, number][];
  color: string;
  weight: number;
  opacity: number;
  dashArray: string | null;
  aiReasoning: string;
}
