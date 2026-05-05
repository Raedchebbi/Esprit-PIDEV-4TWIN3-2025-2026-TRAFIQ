import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyticsService } from './analytics.service';

@Controller('mongo/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class MongoAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dangerous-zones')
  getDangerousZones(@Query('limit') limit?: string) {
    return this.analyticsService.getMostDangerousZones(
      this.parseLimit(limit, 10),
    );
  }

  @Get('peak-accident-times')
  getPeakAccidentTimes(@Query('limit') limit?: string) {
    return this.analyticsService.getPeakAccidentTimes(
      this.parseLimit(limit, 24),
    );
  }

  @Get('behavior-anomalies')
  getBehaviorAnomalies(@Query('limit') limit?: string) {
    return this.analyticsService.getBehaviorAnomalies(
      this.parseLimit(limit, 20),
    );
  }

  private parseLimit(limit: string | undefined, fallback: number): number {
    const parsed = Number(limit);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
