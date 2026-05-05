import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Accident } from './accident.schema';
import { MongoPrimaryRepository } from '../mongodb/mongo-primary.repository';

@Injectable()
export class AccidentsService {
  private readonly logger = new Logger(AccidentsService.name);

  // Python AI engine appends one JSON object per line to this file.
  private readonly incidentsFile = path.resolve(
    process.cwd(),
    '../ai-engine/incidents.jsonl',
  );

  constructor(private readonly mongoPrimary: MongoPrimaryRepository) {}

  private readAll(): Accident[] {
    if (!fs.existsSync(this.incidentsFile)) {
      return [];
    }
    const raw = fs.readFileSync(this.incidentsFile, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as Accident;
        } catch {
          return null;
        }
      })
      .filter((item): item is Accident => item !== null);
  }

  private writeAll(incidents: Accident[]): void {
    const data = incidents.map((inc) => JSON.stringify(inc)).join('\n') + '\n';
    fs.writeFileSync(this.incidentsFile, data, 'utf8');
  }

  /** Returns all incidents (including false positives) — for the Incidents page. */
  async findAll(): Promise<Accident[]> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      try {
        return await this.mongoPrimary.findIncidents(false, 100);
      } catch (error) {
        this.logger.warn(
          `Mongo incidents read failed, using JSON: ${this.errorMessage(error)}`,
        );
      }
    }
    return this.readAll().reverse().slice(0, 100);
  }

  /** Returns only non-false-positive incidents — for dashboard, map, congestion. */
  async findActive(): Promise<Accident[]> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      try {
        return await this.mongoPrimary.findIncidents(true, 100);
      } catch (error) {
        this.logger.warn(
          `Mongo active incidents read failed, using JSON: ${this.errorMessage(error)}`,
        );
      }
    }
    return this.readAll()
      .filter((inc) => !inc.false_positive)
      .reverse()
      .slice(0, 100);
  }

  async flagFalsePositives(ids: string[]): Promise<number> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      return this.mongoPrimary.setFalsePositive(ids, true);
    }
    const all = this.readAll();
    let count = 0;
    for (const inc of all) {
      if (ids.includes(inc.incident_id)) {
        inc.false_positive = true;
        count++;
      }
    }
    if (count > 0) this.writeAll(all);
    return count;
  }

  async unflagFalsePositives(ids: string[]): Promise<number> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      return this.mongoPrimary.unsetFalsePositive(ids);
    }
    const all = this.readAll();
    let count = 0;
    for (const inc of all) {
      if (ids.includes(inc.incident_id) && inc.false_positive) {
        delete inc.false_positive;
        count++;
      }
    }
    if (count > 0) this.writeAll(all);
    return count;
  }

  async removeIncidents(ids: string[]): Promise<number> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      return this.mongoPrimary.deleteIncidents(ids);
    }
    const all = this.readAll();
    const filtered = all.filter((inc) => !ids.includes(inc.incident_id));
    const removed = all.length - filtered.length;
    if (removed > 0) this.writeAll(filtered);
    return removed;
  }

  // ── Country-scoped variants ─────────────────────────────────────────────────

  /** Returns all incidents for cameras belonging to the given country. */
  async findAllByCountry(cameraIds: string[]): Promise<Accident[]> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      try {
        return await this.mongoPrimary.findIncidentsByCameraIds(
          cameraIds,
          false,
          100,
        );
      } catch (error) {
        this.logger.warn(
          `Mongo scoped incidents read failed, using JSON: ${this.errorMessage(error)}`,
        );
      }
    }
    return this.readAll()
      .filter((inc) => cameraIds.includes(inc.camera_id))
      .reverse()
      .slice(0, 100);
  }

  /** Returns active (non-false-positive) incidents for a specific country. */
  async findActiveByCountry(cameraIds: string[]): Promise<Accident[]> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      try {
        return await this.mongoPrimary.findIncidentsByCameraIds(
          cameraIds,
          true,
          100,
        );
      } catch (error) {
        this.logger.warn(
          `Mongo scoped active incidents read failed, using JSON: ${this.errorMessage(error)}`,
        );
      }
    }
    return this.readAll()
      .filter((inc) => !inc.false_positive && cameraIds.includes(inc.camera_id))
      .reverse()
      .slice(0, 100);
  }

  /** Flag false positives — only for incidents belonging to allowed cameras. */
  async flagFalsePositivesScoped(
    ids: string[],
    allowedCameraIds: string[],
  ): Promise<number> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      const allowed = await this.mongoPrimary.findIncidentsByCameraIds(
        allowedCameraIds,
        false,
        1000,
      );
      return this.mongoPrimary.setFalsePositive(
        allowed
          .filter((incident) => ids.includes(incident.incident_id))
          .map((incident) => incident.incident_id),
        true,
      );
    }
    const all = this.readAll();
    let count = 0;
    for (const inc of all) {
      if (
        ids.includes(inc.incident_id) &&
        allowedCameraIds.includes(inc.camera_id)
      ) {
        inc.false_positive = true;
        count++;
      }
    }
    if (count > 0) this.writeAll(all);
    return count;
  }

  /** Unflag false positives — only for incidents belonging to allowed cameras. */
  async unflagFalsePositivesScoped(
    ids: string[],
    allowedCameraIds: string[],
  ): Promise<number> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      const allowed = await this.mongoPrimary.findIncidentsByCameraIds(
        allowedCameraIds,
        false,
        1000,
      );
      return this.mongoPrimary.unsetFalsePositive(
        allowed
          .filter((incident) => ids.includes(incident.incident_id))
          .map((incident) => incident.incident_id),
      );
    }
    const all = this.readAll();
    let count = 0;
    for (const inc of all) {
      if (
        ids.includes(inc.incident_id) &&
        inc.false_positive &&
        allowedCameraIds.includes(inc.camera_id)
      ) {
        delete inc.false_positive;
        count++;
      }
    }
    if (count > 0) this.writeAll(all);
    return count;
  }

  /** Remove incidents — only for incidents belonging to allowed cameras. */
  async removeIncidentsScoped(
    ids: string[],
    allowedCameraIds: string[],
  ): Promise<number> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      const allowed = await this.mongoPrimary.findIncidentsByCameraIds(
        allowedCameraIds,
        false,
        1000,
      );
      return this.mongoPrimary.deleteIncidents(
        allowed
          .filter((incident) => ids.includes(incident.incident_id))
          .map((incident) => incident.incident_id),
      );
    }
    const all = this.readAll();
    const filtered = all.filter(
      (inc) =>
        !(
          ids.includes(inc.incident_id) &&
          allowedCameraIds.includes(inc.camera_id)
        ),
    );
    const removed = all.length - filtered.length;
    if (removed > 0) this.writeAll(filtered);
    return removed;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
