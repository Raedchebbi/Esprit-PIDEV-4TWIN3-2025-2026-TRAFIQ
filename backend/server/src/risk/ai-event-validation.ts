import { Logger } from '@nestjs/common';
import type { VehicleCountsSnapshot } from './vehicle-counts.store';

export interface ValidatedAiEvent<T extends Record<string, unknown>> {
  valid: true;
  data: T;
}

export interface InvalidAiEvent {
  valid: false;
  reason: string;
}

export type AiEventValidationResult<T extends Record<string, unknown>> =
  | ValidatedAiEvent<T>
  | InvalidAiEvent;

export type RiskEventPayload = Record<string, unknown> & {
  timestamp?: string;
  camera_id?: string;
  cam_id?: string;
};

export type IncidentConfirmedPayload = Record<string, unknown> & {
  incident_id: string;
  incident_type: string;
  camera_id: string;
  cam_id?: string;
  timestamp: string;
  snapshot?: string;
};

export type CameraStatusPayload = Record<string, unknown> & {
  camera_id: string;
  cam_id?: string;
  status: string;
};

export type VehicleCountsPayload = VehicleCountsSnapshot &
  Record<string, unknown>;

export class AiEventValidation {
  private readonly logger = new Logger(AiEventValidation.name);

  validateRiskEvent(data: unknown): AiEventValidationResult<RiskEventPayload> {
    const payload = this.asRecord(data);
    if (!payload) return { valid: false, reason: 'payload must be an object' };

    const riskScore = payload.risk_score ?? payload.riskScore;
    if (riskScore !== undefined && !this.isFiniteNumberLike(riskScore)) {
      return { valid: false, reason: 'risk_score must be numeric' };
    }

    return { valid: true, data: this.normalizeCamera(payload) };
  }

  validateIncidentConfirmed(
    data: unknown,
  ): AiEventValidationResult<IncidentConfirmedPayload> {
    const payload = this.asRecord(data);
    if (!payload) return { valid: false, reason: 'payload must be an object' };

    const normalized = this.normalizeCamera(payload);
    const cameraId = this.readString(normalized, 'camera_id');
    if (!cameraId) return { valid: false, reason: 'camera_id is required' };

    const timestamp = this.readTimestamp(normalized);
    const incidentId =
      this.readString(normalized, 'incident_id', 'incidentId', 'id') ??
      this.deriveIncidentId(normalized, cameraId, timestamp);

    const incidentType =
      this.readString(normalized, 'incident_type', 'incidentType', 'type') ??
      'vehicle_collision';

    return {
      valid: true,
      data: {
        ...normalized,
        incident_id: incidentId,
        incident_type: incidentType,
        camera_id: cameraId,
        timestamp,
      },
    };
  }

  validateCameraStatus(
    data: unknown,
  ): AiEventValidationResult<CameraStatusPayload> {
    const payload = this.asRecord(data);
    if (!payload) return { valid: false, reason: 'payload must be an object' };

    const normalized = this.normalizeCamera(payload);
    const cameraId = this.readString(normalized, 'camera_id');
    const status = this.readString(normalized, 'status');
    if (!cameraId) return { valid: false, reason: 'camera_id is required' };
    if (!status) return { valid: false, reason: 'status is required' };

    return {
      valid: true,
      data: { ...normalized, camera_id: cameraId, status },
    };
  }

  validateVehicleCounts(
    data: unknown,
  ): AiEventValidationResult<VehicleCountsPayload> {
    const payload = this.asRecord(data);
    if (!payload) return { valid: false, reason: 'payload must be an object' };
    if (!this.isFiniteNumberLike(payload.total)) {
      return { valid: false, reason: 'total must be numeric' };
    }
    if (!Array.isArray(payload.per_camera)) {
      return { valid: false, reason: 'per_camera must be an array' };
    }

    const perCamera = payload.per_camera.map((entry) => {
      const item = this.asRecord(entry);
      const normalized = item ? this.normalizeCamera(item) : null;
      const cameraId = normalized
        ? this.readString(normalized, 'camera_id')
        : null;
      const count = normalized?.count;
      if (!normalized || !cameraId || !this.isFiniteNumberLike(count)) {
        return null;
      }
      return { cam_id: cameraId, count: Number(count) };
    });

    if (perCamera.some((entry) => entry === null)) {
      return {
        valid: false,
        reason: 'per_camera entries must include cam_id and count',
      };
    }

    return {
      valid: true,
      data: {
        ...payload,
        total: Number(payload.total),
        per_camera: perCamera as VehicleCountsSnapshot['per_camera'],
        timestamp: this.readTimestamp(payload),
      },
    };
  }

  private asRecord(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  }

  private normalizeCamera(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const cameraId = this.readString(
      payload,
      'camera_id',
      'cam_id',
      'cameraId',
    );
    if (!cameraId) return payload;
    return {
      ...payload,
      camera_id: this.normalizeCameraId(cameraId),
      cam_id: cameraId,
    };
  }

  private normalizeCameraId(cameraId: string): string {
    if (/^cam\d+$/.test(cameraId)) return cameraId;
    if (/^\d+$/.test(cameraId)) return `cam${cameraId}`;
    return cameraId;
  }

  private readString(
    payload: Record<string, unknown>,
    ...keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) return value;
      if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    }
    return undefined;
  }

  private readTimestamp(payload: Record<string, unknown>): string {
    const value = payload.timestamp ?? payload.ts ?? payload.created_at;
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    return new Date().toISOString();
  }

  private isFiniteNumberLike(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return Number.isFinite(Number(value));
    return false;
  }

  private deriveIncidentId(
    payload: Record<string, unknown>,
    cameraId: string,
    timestamp: string,
  ): string {
    const raw = [
      cameraId,
      timestamp,
      this.safeString(payload.snapshot),
      this.safeString(payload.vehicle_a),
      this.safeString(payload.vehicle_b),
    ].join('_');
    const stable = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    const id = `derived_${stable}`;
    this.logger.warn(`Derived missing incident_id for AI event (${cameraId})`);
    return id;
  }

  private safeString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return '';
  }
}
