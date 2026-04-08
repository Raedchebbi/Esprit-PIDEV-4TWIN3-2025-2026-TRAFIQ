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

  findAll(): Accident[] {
    return this.readAll().reverse().slice(0, 100);
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

  removeIncidents(ids: string[]): number {
    const all = this.readAll();
    const filtered = all.filter((inc) => !ids.includes(inc.incident_id));
    const removed = all.length - filtered.length;
    if (removed > 0) this.writeAll(filtered);
    return removed;
  }
}
