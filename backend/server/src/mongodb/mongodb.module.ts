import { Global, Module } from '@nestjs/common';
import { CamerasModule } from '../cameras/cameras.module';
import { AnalyticsService } from './analytics.service';
import { GeoNotificationService } from './geo-notification.service';
import { HistoricalRiskService } from './historical-risk.service';
import { MongoAnalyticsController } from './mongo-analytics.controller';
import { MongoPrimaryRepository } from './mongo-primary.repository';
import { MongoTelemetryController } from './mongo-telemetry.controller';
import { MongoTelemetryRepository } from './mongo-telemetry.repository';
import { MongoTelemetryService } from './mongo-telemetry.service';
import { MongoDbService } from './mongodb.service';
import { UserSessionService } from './user-session.service';

@Global()
@Module({
  imports: [CamerasModule],
  controllers: [MongoTelemetryController, MongoAnalyticsController],
  providers: [
    MongoDbService,
    MongoPrimaryRepository,
    MongoTelemetryRepository,
    MongoTelemetryService,
    HistoricalRiskService,
    GeoNotificationService,
    UserSessionService,
    AnalyticsService,
  ],
  exports: [
    MongoDbService,
    MongoPrimaryRepository,
    MongoTelemetryService,
    HistoricalRiskService,
    GeoNotificationService,
    UserSessionService,
    AnalyticsService,
  ],
})
export class MongoDbModule {}
