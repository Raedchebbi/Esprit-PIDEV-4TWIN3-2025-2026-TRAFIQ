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

@Controller('public/navigation')
export class NavigationController {
  constructor(private readonly navigationService: NavigationService) {}

  /**
   * POST /public/navigation/start
   * Start a new navigation session with route data.
   */
  @Post('start')
  startNavigation(@Body() dto: StartNavigationDto) {
    return this.navigationService.startSession(dto);
  }

  /**
   * PATCH /public/navigation/:id/position
   * Update the user's current position within a session.
   */
  @Patch(':id/position')
  updatePosition(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    this.navigationService.updatePosition(id, dto);
    return { ok: true };
  }

  /**
   * GET /public/navigation/:id/alerts
   * Get scoped alerts for a navigation session.
   * Only returns alerts on the user's route or within their geo zone.
   */
  @Get(':id/alerts')
  getAlerts(@Param('id') id: string) {
    return this.navigationService.getAlerts(id);
  }

  /**
   * DELETE /public/navigation/:id
   * End a navigation session.
   */
  @Delete(':id')
  endNavigation(@Param('id') id: string) {
    this.navigationService.endSession(id);
    return { ok: true };
  }
}
