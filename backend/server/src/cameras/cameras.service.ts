import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface CameraEntry {
  id: string;
  label: string;
  area: string;
  city?: string;
  location: { latitude: number; longitude: number };
  stream_url?: string;
  media_url: string;
  media_type?: 'video' | 'iframe';
  enabled?: boolean;
}

@Injectable()
export class CamerasService implements OnModuleInit {
  private readonly logger = new Logger(CamerasService.name);
  private cameras: CameraEntry[] = [];
  private readonly configPath = path.resolve(
    process.cwd(),
    '../ai-engine/cameras.json',
  );

  onModuleInit() {
    this.loadConfig();
  }

  private loadConfig() {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      const cameras =
        typeof parsed === 'object' && parsed !== null && 'cameras' in parsed
          ? ((parsed as { cameras?: CameraEntry[] }).cameras ?? [])
          : [];

      this.cameras = cameras.filter((c: CameraEntry) => c.enabled !== false);
      this.logger.log(
        `Loaded ${this.cameras.length} camera(s) from ${this.configPath}`,
      );
    } catch (err) {
      this.logger.error(`Failed to load cameras config: ${err}`);
      this.cameras = [];
    }
  }

  findAll(): CameraEntry[] {
    // Re-read on every request so changes to cameras.json are picked up without restart
    this.loadConfig();
    return this.cameras;
  }

  /** Return only cameras whose `area` matches the given country. */
  findByCountry(country: string): CameraEntry[] {
    this.loadConfig();
    return this.cameras.filter(
      (c) => c.area?.toLowerCase() === country.toLowerCase(),
    );
  }

  /** Return camera IDs belonging to a given country. */
  getCameraIdsForCountry(country: string): string[] {
    return this.findByCountry(country).map((c) => c.id);
  }
}
