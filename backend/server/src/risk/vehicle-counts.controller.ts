// ── TRAFIQ — Vehicle Counts Controller ────────────────────────────────────────
// GET /vehicle-counts is protected by JWT. ADMIN sees only counts for cameras
// in their assigned country. SUPER_ADMIN sees complete data.

import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { VehicleCountsStore } from './vehicle-counts.store';
import { CamerasService } from '../cameras/cameras.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/user.interface';

@Controller('vehicle-counts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class VehicleCountsController {
  constructor(
    private readonly store: VehicleCountsStore,
    private readonly camerasService: CamerasService,
  ) {}

  @Get()
  getLatest(@Request() req: { user: RequestUser }) {
    const snapshot = this.store.getLatest();
    const user = req.user;

    // SUPER_ADMIN: full data
    if (user.role === 'SUPER_ADMIN') {
      return snapshot;
    }

    // ADMIN: filter per_camera to their country's cameras only
    const allowedIds = this.camerasService.getCameraIdsForCountry(
      user.country!,
    );
    const filtered = (snapshot.per_camera || []).filter((c) =>
      allowedIds.includes(c.cam_id),
    );
    return {
      total: filtered.reduce((sum, c) => sum + c.count, 0),
      per_camera: filtered,
      timestamp: snapshot.timestamp,
    };
  }
}
