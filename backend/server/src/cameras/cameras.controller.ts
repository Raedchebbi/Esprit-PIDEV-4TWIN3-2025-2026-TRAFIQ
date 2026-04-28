// ── TRAFIQ — Cameras Controller ───────────────────────────────────────────────
// GET /cameras is protected by JWT. ADMIN sees only their country's cameras;
// SUPER_ADMIN sees all. An optional ?country= query param allows SUPER_ADMIN
// to filter by country.

import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { CamerasService } from './cameras.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequestUser } from '../auth/user.interface';

@Controller('cameras')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class CamerasController {
  constructor(private readonly camerasService: CamerasService) {}

  @Get()
  findAll(
    @Request() req: { user: RequestUser },
    @Query('country') countryFilter?: string,
  ) {
    const user = req.user;

    // ADMIN: strict country scope — always filtered to their assigned country
    if (user.role === 'ADMIN') {
      return this.camerasService.findByCountry(user.country!);
    }

    // SUPER_ADMIN: optional country filter, otherwise all cameras
    if (countryFilter) {
      return this.camerasService.findByCountry(countryFilter);
    }
    return this.camerasService.findAll();
  }
}
