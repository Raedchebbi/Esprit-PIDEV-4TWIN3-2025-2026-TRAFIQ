import { Module, forwardRef } from '@nestjs/common';
import { NavigationModule } from '../navigation/navigation.module';
import { RiskGateway } from './risk.gateway';
import { VehicleCountsStore } from './vehicle-counts.store';
import { VehicleCountsController } from './vehicle-counts.controller';
import { CamerasModule } from '../cameras/cameras.module';

@Module({
  imports: [CamerasModule, forwardRef(() => NavigationModule)],
  controllers: [VehicleCountsController],
  providers: [RiskGateway, VehicleCountsStore],
  exports: [VehicleCountsStore],
})
export class RiskModule {}
