import type { ObjectId } from 'mongodb';
import type { Accident } from '../accidents/accident.schema';
import type { User } from '../auth/user.interface';
import type { CameraEntry } from '../cameras/cameras.service';
import type { VehicleCountsSnapshot } from '../risk/vehicle-counts.store';

export interface PrimaryDocument {
  _id?: ObjectId;
  persistedAt: Date;
  updatedAt: Date;
  migratedFrom?: string;
}

export type IncidentDocument = Omit<Accident, 'false_positive'> &
  PrimaryDocument & {
    incident_id: string;
    false_positive?: boolean;
    location?: {
      type: 'Point';
      coordinates: [number, number];
    };
  };

export type CameraDocument = CameraEntry &
  PrimaryDocument & {
    id: string;
    geo?: {
      type: 'Point';
      coordinates: [number, number];
    };
  };

export type UserDocument = User &
  PrimaryDocument & {
    id: string;
    emailLower: string;
  };

export interface VehicleCountsDocument extends PrimaryDocument {
  snapshotId: string;
  latest: boolean;
  snapshot: VehicleCountsSnapshot;
  timestamp: Date;
}
