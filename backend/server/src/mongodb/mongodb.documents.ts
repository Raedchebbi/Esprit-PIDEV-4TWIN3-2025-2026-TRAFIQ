import type { ObjectId } from 'mongodb';

export type JsonRecord = Record<string, unknown>;

export interface BaseMongoDocument {
  _id?: ObjectId;
  createdAt: Date;
  updatedAt?: Date;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface AiEventDocument extends BaseMongoDocument {
  eventType: string;
  source: string;
  timestamp: Date;
  cameraId?: string;
  riskScore?: number;
  riskLevel?: string;
  confidence?: number;
  rawPayload: JsonRecord;
  metadata?: JsonRecord;
}

export interface TrafficIncidentDocument extends BaseMongoDocument {
  incidentId?: string;
  incidentType?: string;
  timestamp: Date;
  cameraId?: string;
  snapshot?: string;
  vehicleA?: number;
  vehicleB?: number;
  iou?: number;
  confidence?: number;
  riskScore?: number;
  riskLevel?: string;
  riskReason?: string;
  falsePositive?: boolean;
  location?: GeoPoint;
  rawPayload?: JsonRecord;
}

export interface RouteContext {
  routeId?: string;
  routeCoords?: [number, number][];
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
}

export interface TelemetryLogDocument extends BaseMongoDocument {
  source: string;
  level: string;
  message: string;
  timestamp: Date;
  cameraId?: string;
  payload?: JsonRecord;
}

export interface NotificationDocument extends BaseMongoDocument {
  recipientId?: string;
  sessionId?: string;
  incidentId?: string;
  type: string;
  status: string;
  title: string;
  message: string;
  timestamp: Date;
  distanceMeters?: number;
  matchType?: string;
  payload?: JsonRecord;
}

export interface UserSessionTrackingDocument extends BaseMongoDocument {
  sessionId: string;
  userId?: string;
  startedAt: Date;
  endedAt?: Date;
  lastSeenAt: Date;
  clientType?: string;
  location?: GeoPoint;
  country?: string;
  activeRoute?: RouteContext;
  metadata?: JsonRecord;
}

export type AiEventInput = Omit<
  AiEventDocument,
  '_id' | 'createdAt' | 'updatedAt'
>;

export type TrafficIncidentInput = Omit<
  TrafficIncidentDocument,
  '_id' | 'createdAt' | 'updatedAt'
>;

export type TelemetryLogInput = Omit<
  TelemetryLogDocument,
  '_id' | 'createdAt' | 'updatedAt'
>;

export type NotificationInput = Omit<
  NotificationDocument,
  '_id' | 'createdAt' | 'updatedAt'
>;

export type UserSessionTrackingInput = Omit<
  UserSessionTrackingDocument,
  '_id' | 'createdAt' | 'updatedAt'
>;
