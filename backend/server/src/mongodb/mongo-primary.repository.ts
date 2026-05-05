import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Filter } from 'mongodb';
import type { Accident } from '../accidents/accident.schema';
import type { User } from '../auth/user.interface';
import type { CameraEntry } from '../cameras/cameras.service';
import type { VehicleCountsSnapshot } from '../risk/vehicle-counts.store';
import { MONGODB_COLLECTIONS } from './mongodb.collections';
import { MongoDbService } from './mongodb.service';
import {
  CameraDocument,
  IncidentDocument,
  UserDocument,
  VehicleCountsDocument,
} from './mongo-primary.documents';

@Injectable()
export class MongoPrimaryRepository implements OnApplicationBootstrap {
  private readonly logger = new Logger(MongoPrimaryRepository.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mongoDb: MongoDbService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureIndexes();
  }

  isPrimaryEnabled(): boolean {
    return (
      this.mongoDb.isConnected() &&
      this.configService.get<string>('USE_MONGO_AS_PRIMARY') === 'true'
    );
  }

  async ensureIndexes(): Promise<void> {
    if (!this.mongoDb.isConnected()) return;

    try {
      const incidents = this.mongoDb.collection<IncidentDocument>(
        MONGODB_COLLECTIONS.incidents,
      );
      const cameras = this.mongoDb.collection<CameraDocument>(
        MONGODB_COLLECTIONS.cameras,
      );
      const users = this.mongoDb.collection<UserDocument>(
        MONGODB_COLLECTIONS.users,
      );
      const vehicleCounts = this.mongoDb.collection<VehicleCountsDocument>(
        MONGODB_COLLECTIONS.vehicleCounts,
      );

      await Promise.all([
        incidents?.createIndex(
          { incident_id: 1 },
          { unique: true, name: 'uniq_incident_id' },
        ),
        incidents?.createIndex(
          { camera_id: 1, timestamp: -1 },
          { name: 'incident_camera_ts_desc' },
        ),
        incidents?.createIndex(
          { false_positive: 1, timestamp: -1 },
          { name: 'incident_false_positive_ts_desc' },
        ),
        incidents?.createIndex(
          { location: '2dsphere' },
          { sparse: true, name: 'incident_location_2dsphere' },
        ),
        cameras?.createIndex(
          { id: 1 },
          { unique: true, name: 'uniq_camera_id' },
        ),
        cameras?.createIndex({ area: 1 }, { name: 'camera_area' }),
        cameras?.createIndex(
          { geo: '2dsphere' },
          { sparse: true, name: 'camera_geo_2dsphere' },
        ),
        users?.createIndex(
          { id: 1 },
          { unique: true, sparse: true, name: 'uniq_user_id' },
        ),
        users?.createIndex(
          { emailLower: 1 },
          { unique: true, name: 'uniq_user_email_lower' },
        ),
        vehicleCounts?.createIndex(
          { latest: 1, timestamp: -1 },
          { name: 'vehicle_counts_latest_ts_desc' },
        ),
        vehicleCounts?.createIndex(
          { snapshotId: 1 },
          { unique: true, name: 'uniq_snapshot_id' },
        ),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create primary MongoDB indexes: ${message}`);
    }
  }

  async upsertIncident(
    incident: Accident,
    migratedFrom?: string,
  ): Promise<void> {
    const collection = this.mongoDb.collection<IncidentDocument>(
      MONGODB_COLLECTIONS.incidents,
    );
    if (!collection) return;

    const now = new Date();
    const location = this.locationFromUnknown(
      (incident as Accident & { location?: unknown }).location,
    );
    await collection.updateOne(
      { incident_id: incident.incident_id },
      {
        $set: {
          ...incident,
          location,
          updatedAt: now,
          migratedFrom,
        },
        $setOnInsert: { persistedAt: now },
      },
      { upsert: true },
    );
  }

  async findIncidents(activeOnly = false, limit = 100): Promise<Accident[]> {
    const collection = this.mongoDb.collection<IncidentDocument>(
      MONGODB_COLLECTIONS.incidents,
    );
    if (!collection) return [];

    const filter: Filter<IncidentDocument> = activeOnly
      ? { false_positive: { $ne: true } }
      : {};
    const documents = await collection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => this.toIncident(document));
  }

  async findIncidentsByCameraIds(
    cameraIds: string[],
    activeOnly = false,
    limit = 100,
  ): Promise<Accident[]> {
    const collection = this.mongoDb.collection<IncidentDocument>(
      MONGODB_COLLECTIONS.incidents,
    );
    if (!collection) return [];

    const filter: Filter<IncidentDocument> = {
      camera_id: { $in: cameraIds },
    };
    if (activeOnly) filter.false_positive = { $ne: true };
    const documents = await collection
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => this.toIncident(document));
  }

  async setFalsePositive(ids: string[], value: boolean): Promise<number> {
    const collection = this.mongoDb.collection<IncidentDocument>(
      MONGODB_COLLECTIONS.incidents,
    );
    if (!collection) return 0;
    const result = await collection.updateMany(
      { incident_id: { $in: ids } },
      { $set: { false_positive: value, updatedAt: new Date() } },
    );
    return result.modifiedCount;
  }

  async unsetFalsePositive(ids: string[]): Promise<number> {
    const collection = this.mongoDb.collection<IncidentDocument>(
      MONGODB_COLLECTIONS.incidents,
    );
    if (!collection) return 0;
    const result = await collection.updateMany(
      { incident_id: { $in: ids }, false_positive: true },
      { $unset: { false_positive: '' }, $set: { updatedAt: new Date() } },
    );
    return result.modifiedCount;
  }

  async deleteIncidents(ids: string[]): Promise<number> {
    const collection = this.mongoDb.collection<IncidentDocument>(
      MONGODB_COLLECTIONS.incidents,
    );
    if (!collection) return 0;
    const result = await collection.deleteMany({ incident_id: { $in: ids } });
    return result.deletedCount;
  }

  async upsertCamera(
    camera: CameraEntry,
    migratedFrom?: string,
  ): Promise<void> {
    const collection = this.mongoDb.collection<CameraDocument>(
      MONGODB_COLLECTIONS.cameras,
    );
    if (!collection) return;
    const now = new Date();
    await collection.updateOne(
      { id: camera.id },
      {
        $set: {
          ...camera,
          geo: this.geoFromCamera(camera),
          updatedAt: now,
          migratedFrom,
        },
        $setOnInsert: { persistedAt: now },
      },
      { upsert: true },
    );
  }

  async findCameras(): Promise<CameraEntry[]> {
    const collection = this.mongoDb.collection<CameraDocument>(
      MONGODB_COLLECTIONS.cameras,
    );
    if (!collection) return [];
    const documents = await collection
      .find({ enabled: { $ne: false } })
      .toArray();
    return documents.map((document) => this.toCamera(document));
  }

  async upsertUser(user: User, migratedFrom?: string): Promise<void> {
    const collection = this.mongoDb.collection<UserDocument>(
      MONGODB_COLLECTIONS.users,
    );
    if (!collection) return;
    const now = new Date();
    await collection.updateOne(
      { emailLower: user.email.toLowerCase() },
      {
        $set: {
          ...user,
          emailLower: user.email.toLowerCase(),
          updatedAt: now,
          migratedFrom,
        },
        $setOnInsert: { persistedAt: now },
      },
      { upsert: true },
    );
  }

  async findUsers(): Promise<User[]> {
    const collection = this.mongoDb.collection<UserDocument>(
      MONGODB_COLLECTIONS.users,
    );
    if (!collection) return [];
    const documents = await collection.find().toArray();
    return documents.map((document) => this.toUser(document));
  }

  async updateVehicleCounts(
    snapshot: VehicleCountsSnapshot,
    migratedFrom?: string,
  ): Promise<void> {
    const collection = this.mongoDb.collection<VehicleCountsDocument>(
      MONGODB_COLLECTIONS.vehicleCounts,
    );
    if (!collection) return;
    const now = new Date();
    const timestamp = this.toDate(snapshot.timestamp);
    const snapshotId = `${timestamp.toISOString()}_${snapshot.total}`;
    await collection.updateMany({ latest: true }, { $set: { latest: false } });
    await collection.updateOne(
      { snapshotId },
      {
        $set: {
          snapshotId,
          latest: true,
          snapshot,
          timestamp,
          updatedAt: now,
          migratedFrom,
        },
        $setOnInsert: { persistedAt: now },
      },
      { upsert: true },
    );
  }

  async getLatestVehicleCounts(): Promise<VehicleCountsSnapshot | null> {
    const collection = this.mongoDb.collection<VehicleCountsDocument>(
      MONGODB_COLLECTIONS.vehicleCounts,
    );
    if (!collection) return null;
    const document = await collection.findOne(
      { latest: true },
      { sort: { timestamp: -1 } },
    );
    return document?.snapshot ?? null;
  }

  private toIncident(document: IncidentDocument): Accident {
    const { _id, persistedAt, updatedAt, migratedFrom, location, ...incident } =
      document;
    void _id;
    void persistedAt;
    void updatedAt;
    void migratedFrom;
    void location;
    return incident;
  }

  private toCamera(document: CameraDocument): CameraEntry {
    const { _id, persistedAt, updatedAt, migratedFrom, geo, ...camera } =
      document;
    void _id;
    void persistedAt;
    void updatedAt;
    void migratedFrom;
    void geo;
    return camera;
  }

  private toUser(document: UserDocument): User {
    const { _id, persistedAt, updatedAt, migratedFrom, emailLower, ...user } =
      document;
    void _id;
    void persistedAt;
    void updatedAt;
    void migratedFrom;
    void emailLower;
    return user;
  }

  private geoFromCamera(camera: CameraEntry) {
    if (!camera.location) return undefined;
    return {
      type: 'Point' as const,
      coordinates: [camera.location.longitude, camera.location.latitude] as [
        number,
        number,
      ],
    };
  }

  private locationFromUnknown(value: unknown) {
    if (!value || typeof value !== 'object') return undefined;
    const location = value as { latitude?: unknown; longitude?: unknown };
    if (
      typeof location.latitude !== 'number' ||
      typeof location.longitude !== 'number'
    ) {
      return undefined;
    }
    return {
      type: 'Point' as const,
      coordinates: [location.longitude, location.latitude] as [number, number],
    };
  }

  private toDate(value: string): Date {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }
}
