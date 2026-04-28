import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface PerCameraCount {
  cam_id: string;
  count: number;
}

export interface VehicleCountsSnapshot {
  total: number;
  per_camera: PerCameraCount[];
  timestamp: string;
}

@Injectable()
export class VehicleCountsStore {
  private readonly logger = new Logger(VehicleCountsStore.name);
  private latestSnapshot: VehicleCountsSnapshot = {
    total: 0,
    per_camera: [],
    timestamp: '',
  };
  private readonly filePath = path.resolve(
    process.cwd(),
    '../ai-engine/vehicle_counts.json',
  );

  /** Called by the WebSocket gateway when a live event arrives. */
  update(data: VehicleCountsSnapshot): void {
    this.latestSnapshot = data;
  }

  /** Read the latest counts from the file written by the AI engine. */
  getLatest(): VehicleCountsSnapshot {
    try {
      if (this.latestSnapshot.timestamp) {
        return this.latestSnapshot;
      }

      if (!fs.existsSync(this.filePath)) {
        return { total: 0, per_camera: [], timestamp: '' };
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      this.latestSnapshot = JSON.parse(raw) as VehicleCountsSnapshot;
      return this.latestSnapshot;
    } catch (err) {
      this.logger.warn(`Failed to read vehicle counts: ${err}`);
      return { total: 0, per_camera: [], timestamp: '' };
    }
  }
}
