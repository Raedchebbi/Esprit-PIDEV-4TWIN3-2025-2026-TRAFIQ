// ── TRAFIQ — Navigation Controller ───────────────────────────────────────────
// Public (unauthenticated) REST endpoints for navigation session management.

import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { NavigationService } from './navigation.service';
import {
  StartNavigationDto,
  UpdatePositionDto,
} from './navigation-session.interface';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

@Controller('public/navigation')
export class NavigationController {
  constructor(private readonly navigationService: NavigationService) {}

  /**
   * POST /public/navigation/start
   * Start a new navigation session with route data.
   */
  @Post('start')
  @RateLimit({
    key: 'navigation-start',
    limit: Number(process.env.RATE_LIMIT_NAV_START_LIMIT ?? 20),
    ttlMs: Number(process.env.RATE_LIMIT_NAV_START_TTL_MS ?? 60_000),
  })
  async startNavigation(@Body() dto: StartNavigationDto) {
    return this.navigationService.startSession(dto);
  }

  /**
   * PATCH /public/navigation/:id/position
   * Update the user's current position within a session.
   */
  @Patch(':id/position')
  @RateLimit({
    key: 'navigation-position',
    limit: Number(process.env.RATE_LIMIT_NAV_UPDATE_LIMIT ?? 120),
    ttlMs: Number(process.env.RATE_LIMIT_NAV_UPDATE_TTL_MS ?? 60_000),
  })
  async updatePosition(
    @Param('id') id: string,
    @Body() dto: UpdatePositionDto & { sessionToken?: string },
  ) {
    await this.navigationService.updatePosition(id, dto, dto.sessionToken);
    return { ok: true };
  }

  /**
   * GET /public/navigation/:id/alerts
   * Get scoped alerts for a navigation session.
   * Only returns alerts on the user's route or within their geo zone.
   */
  @Get(':id/alerts')
  async getAlerts(@Param('id') id: string) {
    return this.navigationService.getAlerts(id);
  }

  /**
   * DELETE /public/navigation/:id
   * End a navigation session.
   */
  @Delete(':id')
  @RateLimit({
    key: 'navigation-end',
    limit: Number(process.env.RATE_LIMIT_NAV_END_LIMIT ?? 30),
    ttlMs: Number(process.env.RATE_LIMIT_NAV_END_TTL_MS ?? 60_000),
  })
  async endNavigation(
    @Param('id') id: string,
    @Body() body?: { sessionToken?: string },
  ) {
    await this.navigationService.endSession(id, body?.sessionToken);
    return { ok: true };
  }
}
