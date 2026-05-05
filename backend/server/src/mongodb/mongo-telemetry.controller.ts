import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HistoricalRiskService } from './historical-risk.service';
import { MongoTelemetryService } from './mongo-telemetry.service';
import { MongoDbService } from './mongodb.service';

@Controller('mongo')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class MongoTelemetryController {
  constructor(
    private readonly mongoDb: MongoDbService,
    private readonly telemetryService: MongoTelemetryService,
    private readonly historicalRiskService: HistoricalRiskService,
  ) {}

  @Get('status')
  getStatus() {
    return this.mongoDb.getStatus();
  }

  @Get('ai-events')
  getAiEvents(
    @Query('eventType') eventType?: string,
    @Query('cameraId') cameraId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.telemetryService.findAiEvents({
      eventType,
      cameraId,
      limit: this.parseLimit(limit),
    });
  }

  @Get('incidents')
  getTrafficIncidents(
    @Query('cameraId') cameraId?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.telemetryService.findTrafficIncidents({
      cameraId,
      activeOnly: activeOnly === 'true' || activeOnly === '1',
      limit: this.parseLimit(limit),
    });
  }

  @Get('telemetry')
  getTelemetryLogs(
    @Query('source') source?: string,
    @Query('level') level?: string,
    @Query('limit') limit?: string,
  ) {
    return this.telemetryService.findTelemetryLogs({
      source,
      level,
      limit: this.parseLimit(limit),
    });
  }

  @Get('risk-context')
  getRiskContext(
    @Query('cameraId') cameraId?: string,
    @Query('timestamp') timestamp?: string,
  ) {
    return this.historicalRiskService.getRiskBoost({
      cameraId,
      timestamp: timestamp ? new Date(timestamp) : undefined,
    });
  }

  private parseLimit(limit?: string): number | undefined {
    if (!limit) return undefined;
    const parsed = Number(limit);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
