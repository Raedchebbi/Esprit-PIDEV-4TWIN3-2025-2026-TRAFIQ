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

  findAll(): Accident[] {
    if (!fs.existsSync(this.incidentsFile)) {
      return [];
    }
    const raw = fs.readFileSync(this.incidentsFile, 'utf8');
    const incidents: Accident[] = raw
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as Accident;
        } catch {
          return null;
        }
      })
      .filter((item): item is Accident => item !== null)
      .reverse()
      .slice(0, 100);

    return incidents;
  }
}
