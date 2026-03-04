import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AccidentsService } from './accidents.service';
import * as path from 'path';
import * as fs from 'fs';

@Controller('accidents')
export class AccidentsController {
  constructor(private readonly accidentsService: AccidentsService) {}

  @Get()
  findAll() {
    return this.accidentsService.findAll();
  }

  @Get('snapshot/:filename')
  getSnapshot(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.resolve(process.cwd(), '../ai-engine/snapshots', filename);
    console.log('Serving snapshot from:', filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Snapshot not found' });
    }
    return res.sendFile(filePath);
  }
}