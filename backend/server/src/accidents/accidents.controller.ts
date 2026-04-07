import { Controller, Get, Param, Res, BadRequestException } from '@nestjs/common';
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
    // Prevent path traversal: only allow bare filenames (no slashes, no ..)
    const safeName = path.basename(filename);
    if (safeName !== filename || safeName.includes('..')) {
      throw new BadRequestException('Invalid filename');
    }

    const snapshotsDir = path.resolve(process.cwd(), '../ai-engine/snapshots');
    const filePath = path.join(snapshotsDir, safeName);

    // Double-check the resolved path stays inside the snapshots directory
    if (!filePath.startsWith(snapshotsDir + path.sep)) {
      throw new BadRequestException('Invalid filename');
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Snapshot not found' });
    }
    return res.sendFile(filePath);
  }
}