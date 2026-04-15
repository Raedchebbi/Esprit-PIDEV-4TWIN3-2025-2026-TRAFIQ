import { Module } from '@nestjs/common';
import { AccidentsModule } from './accidents/accidents.module';
import { CamerasModule } from './cameras/cameras.module';
import { RiskModule } from './risk/risk.module';

@Module({
  imports: [AccidentsModule, CamerasModule, RiskModule],
})
export class AppModule {}
