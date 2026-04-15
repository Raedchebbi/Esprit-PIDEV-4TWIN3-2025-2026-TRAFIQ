import { Module } from '@nestjs/common';
import { RiskGateway } from './risk.gateway';
import { VehicleCountsStore } from './vehicle-counts.store';
import { VehicleCountsController } from './vehicle-counts.controller';

@Module({
  controllers: [VehicleCountsController],
  providers: [RiskGateway, VehicleCountsStore],
})
export class RiskModule {}
