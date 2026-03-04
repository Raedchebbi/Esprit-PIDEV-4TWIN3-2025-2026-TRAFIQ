import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Accident, AccidentDocument } from './accident.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AccidentsService {
  constructor(@InjectModel(Accident.name) private accidentModel: Model<AccidentDocument>) {}

  async syncFromJson() {
    const filePath = path.resolve(process.cwd(), '../ai-engine/incidents_log.json');
    if (!fs.existsSync(filePath)) return;

    const raw = fs.readFileSync(filePath, 'utf-8');
    const logs = JSON.parse(raw);

    for (const log of logs) {
      const exists = await this.accidentModel.findOne({ incident_id: log.incident_id });
      if (!exists) await this.accidentModel.create(log);
    }
  }

  async findAll() {
    await this.syncFromJson();
    return this.accidentModel.find().sort({ timestamp: -1 });
  }
}