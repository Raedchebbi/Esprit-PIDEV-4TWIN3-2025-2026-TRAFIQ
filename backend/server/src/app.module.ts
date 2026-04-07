import { Module } from '@nestjs/common';
import { AccidentsModule } from './accidents/accidents.module';
import { RiskModule } from './risk/risk.module';

@Module({
  imports: [AccidentsModule, RiskModule],
})
export class AppModule {}
