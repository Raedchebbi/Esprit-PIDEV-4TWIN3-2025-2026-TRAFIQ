import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Accident } from './accident.schema';

@Injectable()
export class AccidentsService {
  // Python AI engine appends one JSON object per line to this file.
  private readonly incidentsFile = path.resolve(
    process.cwd(),
    '../ai-engine/incidents.jsonl',
  );

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
  findAll(): Accident[] {
    return this.readAll().reverse().slice(0, 100);
  }

  /** Returns only non-false-positive incidents — for dashboard, map, congestion. */
  findActive(): Accident[] {
    return this.readAll()
      .filter((inc) => !inc.false_positive)
      .reverse()
      .slice(0, 100);
  }

  flagFalsePositives(ids: string[]): number {
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

  unflagFalsePositives(ids: string[]): number {
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

  removeIncidents(ids: string[]): number {
    const all = this.readAll();
    const filtered = all.filter((inc) => !ids.includes(inc.incident_id));
    const removed = all.length - filtered.length;
    if (removed > 0) this.writeAll(filtered);
    return removed;
  }

  // ── Country-scoped variants ─────────────────────────────────────────────────

  /** Returns all incidents for cameras belonging to the given country. */
  findAllByCountry(cameraIds: string[]): Accident[] {
    return this.readAll()
      .filter((inc) => cameraIds.includes(inc.camera_id))
      .reverse()
      .slice(0, 100);
  }

  /** Returns active (non-false-positive) incidents for a specific country. */
  findActiveByCountry(cameraIds: string[]): Accident[] {
    return this.readAll()
      .filter((inc) => !inc.false_positive && cameraIds.includes(inc.camera_id))
      .reverse()
      .slice(0, 100);
  }

  /** Flag false positives — only for incidents belonging to allowed cameras. */
  flagFalsePositivesScoped(ids: string[], allowedCameraIds: string[]): number {
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
  unflagFalsePositivesScoped(
    ids: string[],
    allowedCameraIds: string[],
  ): number {
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
  removeIncidentsScoped(ids: string[], allowedCameraIds: string[]): number {
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
}
