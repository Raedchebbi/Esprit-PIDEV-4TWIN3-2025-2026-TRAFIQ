// ── TRAFIQ — Accidents Controller ─────────────────────────────────────────────
// All endpoints protected by JWT. ADMIN users see/modify only incidents for
// cameras in their assigned country. SUPER_ADMIN has global access.

import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Res,
  Request,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AccidentsService } from './accidents.service';
import { CamerasService } from '../cameras/cameras.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/user.interface';
import * as path from 'path';
import * as fs from 'fs';

@Controller('accidents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AccidentsController {
  constructor(
    private readonly accidentsService: AccidentsService,
    private readonly camerasService: CamerasService,
  ) {}

  /** Helper: get allowed camera IDs for the requesting user. */
  private getAllowedCameraIds(user: RequestUser): string[] | null {
    if (user.role === 'SUPER_ADMIN') return null; // null = no filter
    return this.camerasService.getCameraIdsForCountry(user.country!);
  }

  @Get()
  async findAll(@Request() req: { user: RequestUser }) {
    const cameraIds = this.getAllowedCameraIds(req.user);
    if (cameraIds === null) return this.accidentsService.findAll();
    return this.accidentsService.findAllByCountry(cameraIds);
  }

  @Get('active')
  async findActive(@Request() req: { user: RequestUser }) {
    const cameraIds = this.getAllowedCameraIds(req.user);
    if (cameraIds === null) return this.accidentsService.findActive();
    return this.accidentsService.findActiveByCountry(cameraIds);
  }

  @Patch('flag')
  async flagFalsePositives(
    @Body() body: { ids: string[] },
    @Request() req: { user: RequestUser },
  ) {
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const cameraIds = this.getAllowedCameraIds(req.user);
    const count =
      cameraIds === null
        ? await this.accidentsService.flagFalsePositives(body.ids)
        : await this.accidentsService.flagFalsePositivesScoped(
            body.ids,
            cameraIds,
          );
    return { flagged: count };
  }

  @Patch('unflag')
  async unflagFalsePositives(
    @Body() body: { ids: string[] },
    @Request() req: { user: RequestUser },
  ) {
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const cameraIds = this.getAllowedCameraIds(req.user);
    const count =
      cameraIds === null
        ? await this.accidentsService.unflagFalsePositives(body.ids)
        : await this.accidentsService.unflagFalsePositivesScoped(
            body.ids,
            cameraIds,
          );
    return { unflagged: count };
  }

  @Delete('remove')
  async removeIncidents(
    @Body() body: { ids: string[] },
    @Request() req: { user: RequestUser },
  ) {
    if (!Array.isArray(body?.ids) || body.ids.length === 0) {
      throw new BadRequestException('ids must be a non-empty array');
    }
    const cameraIds = this.getAllowedCameraIds(req.user);
    const count =
      cameraIds === null
        ? await this.accidentsService.removeIncidents(body.ids)
        : await this.accidentsService.removeIncidentsScoped(
            body.ids,
            cameraIds,
          );
    return { removed: count };
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
      throw new NotFoundException('Snapshot not found');
    }
    return res.sendFile(filePath);
  }
}
