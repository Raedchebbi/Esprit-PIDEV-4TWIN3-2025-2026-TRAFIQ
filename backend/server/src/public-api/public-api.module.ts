// ── TRAFIQ — Public API Module ────────────────────────────────────────────────
// Registers unauthenticated public endpoints for the citizen app.
// Imports AccidentsModule and CamerasModule to reuse their exported services,
// and RiskModule for VehicleCountsStore access.

import { Module } from '@nestjs/common';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';
import { AccidentsModule } from '../accidents/accidents.module';
import { CamerasModule } from '../cameras/cameras.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [AccidentsModule, CamerasModule, RiskModule],
  controllers: [PublicApiController],
  providers: [PublicApiService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
